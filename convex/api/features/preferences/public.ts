import { type } from "arktype"
import { ConvexError, v } from "convex/values"
import type { MutationCtx, QueryCtx } from "../../../_generated/server"
import type { Id } from "../../../_generated/dataModel"
import { arkId, arkOutputToConvex } from "../../../lib/ark"
import { arkMutation, authedMutation, authedQuery } from "../../../lib/functions"
import {
  emptyPreferences,
  maxResumeBytes,
  Preferences,
  PrefilledSections,
  resumeTypes,
} from "./validators"

export const rowOf = (ctx: QueryCtx, userId: Id<"users">) =>
  ctx.db
    .query("preferences")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .unique()

// Updates the user's row, creating it from empty answers the first time.
const upsert = async (
  ctx: MutationCtx,
  userId: Id<"users">,
  patch: Partial<typeof Preferences.infer> & {
    resumeId?: Id<"_storage">
    resumeName?: string
    prefilled?: typeof PrefilledSections.infer
  }
) => {
  const row = await rowOf(ctx, userId)
  if (row) await ctx.db.patch("preferences", row._id, patch)
  else
    await ctx.db.insert("preferences", {
      ...Preferences.assert(emptyPreferences),
      ...patch,
      userId,
    })
}

const get = authedQuery({
  args: {},
  returns: v.object({
    preferences: v.union(arkOutputToConvex(Preferences), v.null()),
    // null until the Prefilled tab is saved once, so the page can suggest values instead.
    prefilled: v.union(arkOutputToConvex(PrefilledSections), v.null()),
    resume: v.union(v.object({ name: v.string(), url: v.union(v.string(), v.null()) }), v.null()),
  }),
  handler: async (ctx) => {
    const row = await rowOf(ctx, ctx.userId)
    if (!row) return { preferences: null, prefilled: null, resume: null }
    const {
      _id,
      _creationTime,
      userId: _userId,
      resumeId,
      resumeName,
      prefilled,
      ...preferences
    } = row
    return {
      preferences,
      prefilled: prefilled ?? null,
      resume: resumeId
        ? { name: resumeName ?? "Resume", url: await ctx.storage.getUrl(resumeId) }
        : null,
    }
  },
})

// Marks the user as past first run, so `/` stops sending them to Preferences.
const markOnboarded = async (ctx: MutationCtx, userId: Id<"users">) => {
  const user = await ctx.db.get("users", userId)
  if (user && user.onboardedAt === undefined)
    await ctx.db.patch("users", userId, { onboardedAt: Date.now() })
}

const save = arkMutation({
  args: Preferences,
  returns: v.null(),
  handler: async (ctx, preferences) => {
    await upsert(ctx, ctx.userId, preferences)
    await markOnboarded(ctx, ctx.userId)
    return null
  },
})

const savePrefilled = arkMutation({
  args: type({ sections: PrefilledSections }),
  returns: v.null(),
  handler: async (ctx, { sections }) => {
    await upsert(ctx, ctx.userId, { prefilled: sections })
    return null
  },
})

// "Skip for now" on first run.
const skip = authedMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    await markOnboarded(ctx, ctx.userId)
    return null
  },
})

// One resume at a time: a new upload replaces the old file, and no args removes it.
const setResume = arkMutation({
  args: type({ "resumeId?": arkId("_storage"), "name?": "string <= 200" }),
  returns: v.null(),
  handler: async (ctx, { resumeId, name }) => {
    if (resumeId) {
      const file = await ctx.db.system.get("_storage", resumeId)
      if (!file?.contentType || !resumeTypes.includes(file.contentType))
        throw new ConvexError("Upload a PDF, Word or plain text file.")
      if (file.size > maxResumeBytes) throw new ConvexError("Resumes must be 10 MB or smaller.")
      const owner = await ctx.db
        .query("preferences")
        .withIndex("by_resumeId", (q) => q.eq("resumeId", resumeId))
        .first()
      if (owner && owner.userId !== ctx.userId)
        throw new ConvexError("That file belongs to someone else.")
    }
    const row = await rowOf(ctx, ctx.userId)
    if (row?.resumeId && row.resumeId !== resumeId) await ctx.storage.delete(row.resumeId)
    await upsert(ctx, ctx.userId, { resumeId, resumeName: resumeId ? name : undefined })
    return null
  },
})

export const publicApi = { get, save, savePrefilled, skip, setResume }
