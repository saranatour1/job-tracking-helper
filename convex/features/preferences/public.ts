import { type } from "arktype"
import {
  paginationOptsValidator,
  paginationResultValidator,
  type WithoutSystemFields,
} from "convex/server"
import { ConvexError, v } from "convex/values"
import {
  internalMutation,
  internalQuery,
  type MutationCtx,
  type QueryCtx,
} from "../../_generated/server"
import type { Doc, Id } from "../../_generated/dataModel"
import schema from "../../schema"
import { arkId, arkOutputToConvex } from "../../lib/ark"
import { arkMutation, authedMutation, authedQuery } from "../../lib/functions"
import { readReview, Review } from "./resumeRules"
import { answerRowsOf, entryKinds, fieldRowsOf, rowLimits, tagRowsOf } from "./rows"
import {
  maxResumeBytes,
  Preferences,
  PrefilledSections,
  resumeTypes,
  workModes,
} from "./validators"

type Settings = Partial<
  Pick<
    Doc<"preferences">,
    "workMode" | "resumeId" | "resumeName" | "resumeText" | "resumeReview" | "prefilledAt"
  >
>

export const rowOf = (ctx: QueryCtx, userId: Id<"users">) =>
  ctx.db
    .query("preferences")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .unique()

// Updates the user's settings row, creating it the first time.
const upsert = async (ctx: MutationCtx, userId: Id<"users">, patch: Settings) => {
  const row = await rowOf(ctx, userId)
  if (row) await ctx.db.patch("preferences", row._id, patch)
  else await ctx.db.insert("preferences", { workMode: "any", ...patch, userId })
}

const tagsOf = (ctx: QueryCtx, userId: Id<"users">) =>
  ctx.db
    .query("preferenceTags")
    .withIndex("by_userId_and_kind_and_order", (q) => q.eq("userId", userId))
    .take(rowLimits.tags)

const entriesOf = (ctx: QueryCtx, userId: Id<"users">, kind: (typeof entryKinds)[number]) =>
  ctx.db
    .query("profileEntries")
    .withIndex("by_userId_and_kind_and_order", (q) => q.eq("userId", userId).eq("kind", kind))
    .take(rowLimits[kind])

type Table = "preferenceTags" | "profileEntries"
type Row<T extends Table> = Omit<Doc<T>, "_id" | "_creationTime" | "userId">

const sameRow = (a: object, b: object) => {
  const entries = (o: object) =>
    Object.entries(o)
      .filter(([k]) => !["_id", "_creationTime", "userId"].includes(k))
      .sort(([x], [y]) => x.localeCompare(y))
  return JSON.stringify(entries(a)) === JSON.stringify(entries(b))
}

// Rewrites only the slices that changed, so saving one answer touches its own rows
// and leaves the rest alone. A slice is one tag list, one question, or one section.
const sync = async <T extends Table>(
  ctx: MutationCtx,
  table: T,
  userId: Id<"users">,
  current: Doc<T>[],
  next: Row<T>[],
  sliceOf: (row: Row<T>) => string
) => {
  for (const slice of new Set([...current, ...next].map(sliceOf))) {
    const before = current.filter((row) => sliceOf(row) === slice)
    const after = next.filter((row) => sliceOf(row) === slice)
    if (before.length === after.length && before.every((row, i) => sameRow(row, after[i]!)))
      continue
    for (const row of before) await ctx.db.delete(table, row._id)
    for (const row of after)
      // The row came from this table minus its ids, so adding userId makes it whole again.
      await ctx.db.insert(table, { ...row, userId } as unknown as WithoutSystemFields<Doc<T>>)
  }
}

export const writeAnswers = async (
  ctx: MutationCtx,
  userId: Id<"users">,
  form: typeof Preferences.infer
) => {
  await upsert(ctx, userId, { workMode: form.workMode })
  await sync(
    ctx,
    "preferenceTags",
    userId,
    await tagsOf(ctx, userId),
    tagRowsOf(form),
    (r) => r.kind
  )
  await sync(
    ctx,
    "profileEntries",
    userId,
    await entriesOf(ctx, userId, "answer"),
    answerRowsOf(form),
    (r) => r.key
  )
}

export const writeFields = async (
  ctx: MutationCtx,
  userId: Id<"users">,
  sections: typeof PrefilledSections.infer
) => {
  await upsert(ctx, userId, { prefilledAt: Date.now() })
  await sync(
    ctx,
    "profileEntries",
    userId,
    await entriesOf(ctx, userId, "field"),
    fieldRowsOf(sections),
    (r) => `${Math.floor(r.order / 100)}:${r.group}`
  )
}

// Settings and the resume. Tags and entries come from the paginated queries below.
const get = authedQuery({
  args: {},
  returns: v.object({
    settings: v.union(
      v.object({
        workMode: v.union(...workModes.map((m) => v.literal(m))),
        prefilledAt: v.optional(v.number()),
      }),
      v.null()
    ),
    resume: v.union(v.object({ name: v.string(), url: v.union(v.string(), v.null()) }), v.null()),
    // The last review of the resume, until the file changes.
    review: v.union(arkOutputToConvex(Review), v.null()),
  }),
  handler: async (ctx) => {
    const row = await rowOf(ctx, ctx.userId)
    if (!row) return { settings: null, resume: null, review: null }
    return {
      settings: { workMode: row.workMode, prefilledAt: row.prefilledAt },
      resume: row.resumeId
        ? { name: row.resumeName ?? "Resume", url: await ctx.storage.getUrl(row.resumeId) }
        : null,
      review: row.resumeReview ? readReview(row.resumeReview) : null,
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

// Marks the user as past first run, so `/` stops sending them to Preferences.
const markOnboarded = async (ctx: MutationCtx, userId: Id<"users">) => {
  const user = await ctx.db.get("users", userId)
  if (user && user.onboardedAt === undefined)
    await ctx.db.patch("users", userId, { onboardedAt: Date.now() })
}

const save = arkMutation({
  args: Preferences,
  returns: v.null(),
  handler: async (ctx, form) => {
    await writeAnswers(ctx, ctx.userId, form)
    await markOnboarded(ctx, ctx.userId)
    return null
  },
})

const savePrefilled = arkMutation({
  args: type({ sections: PrefilledSections }),
  returns: v.null(),
  handler: async (ctx, { sections }) => {
    await writeFields(ctx, ctx.userId, sections)
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
    // A new file means a new review.
    await upsert(ctx, ctx.userId, {
      resumeId,
      resumeName: resumeId ? name : undefined,
      resumeText: undefined,
      resumeReview: undefined,
    })
    return null
  },
})

// What the review action needs: the file, and the skills and interests to check for.
const resumeToReview = internalQuery({
  args: { userId: v.id("users") },
  returns: v.union(
    v.null(),
    v.object({
      resumeId: v.id("_storage"),
      contentType: v.string(),
      skills: v.array(v.string()),
      interests: v.array(v.string()),
    })
  ),
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

// Everything Preferences stored for the user, for deleting an account.
export const deletePreferences = async (ctx: MutationCtx, userId: Id<"users">) => {
  const row = await rowOf(ctx, userId)
  if (row?.resumeId) await ctx.storage.delete(row.resumeId)
  if (row) await ctx.db.delete("preferences", row._id)
  for (const tag of await tagsOf(ctx, userId)) await ctx.db.delete("preferenceTags", tag._id)
  for (const kind of entryKinds)
    for (const entry of await entriesOf(ctx, userId, kind))
      await ctx.db.delete("profileEntries", entry._id)
}

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
