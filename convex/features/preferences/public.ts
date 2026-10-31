import { entryKinds } from "./validators"
import { paginationOptsValidator, paginationResultValidator } from "convex/server"
import { ConvexError, v } from "convex/values"
import { internalMutation, internalQuery } from "../../_generated/server"
import type { Doc } from "../../_generated/dataModel"
import schema from "../../schema"
import { arkOutputToConvex } from "../../lib/ark"
import { arkMutation, authedMutation, authedQuery } from "../../lib/functions"
import {
  Review,
  maxResumeBytes,
  Preferences,
  resumeTypes,
  vPreferencesView,
  vResumeToReview,
  SavePrefilled,
  SetResume,
} from "./validators"
import { rowOf, upsert, tagsOf, writeAnswers, writeFields, markOnboarded } from "./utils"
import { logEdit } from "../activity/utils"

const get = authedQuery({
  args: {},
  returns: vPreferencesView,
  handler: async (ctx) => {
    const row = await rowOf(ctx, ctx.userId)
    if (!row) return { settings: null, resume: null, review: null }
    return {
      settings: { workMode: row.workMode, prefilledAt: row.prefilledAt },
      resume: row.resumeId
        ? { name: row.resumeName ?? "Resume", url: await ctx.storage.getUrl(row.resumeId) }
        : null,
      review: row.resumeReview ?? null,
    }
  },
})

const tags = authedQuery({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(schema.doc("preferenceTags")),
  handler: (ctx, { paginationOpts }) =>
    ctx.db
      .query("preferenceTags")
      .withIndex("by_userId_and_kind_and_order", (q) => q.eq("userId", ctx.userId))
      .paginate(paginationOpts),
})

const entries = authedQuery({
  args: {
    kind: v.union(...entryKinds.map((k) => v.literal(k))),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(schema.doc("profileEntries")),
  handler: (ctx, { kind, paginationOpts }) =>
    ctx.db
      .query("profileEntries")
      .withIndex("by_userId_and_kind_and_order", (q) => q.eq("userId", ctx.userId).eq("kind", kind))
      .paginate(paginationOpts),
})

const save = arkMutation({
  args: Preferences,
  returns: v.null(),
  handler: async (ctx, form) => {
    await writeAnswers(ctx, ctx.userId, form)
    await markOnboarded(ctx, ctx.userId)
    await logEdit(ctx, ctx.userId, "preferences.save", "Updated your preferences")
    return null
  },
})

const savePrefilled = arkMutation({
  args: SavePrefilled,
  returns: v.null(),
  handler: async (ctx, { sections }) => {
    await writeFields(ctx, ctx.userId, sections)
    await logEdit(ctx, ctx.userId, "preferences.answers", "Updated your saved answers")
    return null
  },
})

const skip = authedMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    await markOnboarded(ctx, ctx.userId)
    return null
  },
})

const setResume = arkMutation({
  args: SetResume,
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
    await upsert(ctx, ctx.userId, {
      resumeId,
      resumeName: resumeId ? name : undefined,
      resumeText: undefined,
      resumeReview: undefined,
    })
    await logEdit(
      ctx,
      ctx.userId,
      "preferences.resume",
      resumeId ? "Uploaded a resume" : "Removed your resume"
    )
    return null
  },
})

const resumeToReview = internalQuery({
  args: { userId: v.id("users") },
  returns: vResumeToReview,
  handler: async (ctx, { userId }) => {
    const row = await rowOf(ctx, userId)
    if (!row?.resumeId) return null
    const file = await ctx.db.system.get("_storage", row.resumeId)
    if (!file) return null
    const tags = await tagsOf(ctx, userId)
    const of = (kind: Doc<"preferenceTags">["kind"]) =>
      tags.filter((t) => t.kind === kind).map((t) => t.value)
    return {
      resumeId: row.resumeId,
      contentType: file.contentType ?? "",
      skills: of("skill"),
      interests: of("interest"),
    }
  },
})

const setResumeReview = internalMutation({
  args: { userId: v.id("users"), text: v.string(), review: arkOutputToConvex(Review) },
  returns: v.null(),
  handler: async (ctx, { userId, text, review }) => {
    await upsert(ctx, userId, { resumeText: text, resumeReview: review })
    return null
  },
})

export const publicApi = {
  get,
  tags,
  entries,
  save,
  savePrefilled,
  skip,
  setResume,
  resumeToReview,
  setResumeReview,
}
