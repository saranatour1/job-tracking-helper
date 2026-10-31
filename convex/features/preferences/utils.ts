import type { Doc, Id } from "../../_generated/dataModel"
import type { QueryCtx, MutationCtx } from "../../_generated/server"
import { rowLimits, sectionOfOrder, tagRowsOf, answerRowsOf, fieldRowsOf, formOf } from "./rows"
import { entryKinds, Preferences, PrefilledSections } from "./validators"

export type Settings = Partial<
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

export const upsert = async (ctx: MutationCtx, userId: Id<"users">, patch: Settings) => {
  const row = await rowOf(ctx, userId)
  if (row) await ctx.db.patch("preferences", row._id, patch)
  else await ctx.db.insert("preferences", { workMode: "any", ...patch, userId })
}

export const tagsOf = (ctx: QueryCtx, userId: Id<"users">) =>
  ctx.db
    .query("preferenceTags")
    .withIndex("by_userId_and_kind_and_order", (q) => q.eq("userId", userId))
    .take(rowLimits.tags)

export const entriesOf = (ctx: QueryCtx, userId: Id<"users">, kind: (typeof entryKinds)[number]) =>
  ctx.db
    .query("profileEntries")
    .withIndex("by_userId_and_kind_and_order", (q) => q.eq("userId", userId).eq("kind", kind))
    .take(rowLimits[kind])

export type Table = "preferenceTags" | "profileEntries"

export type Row<T extends Table> = Omit<Doc<T>, "_id" | "_creationTime" | "userId">

export const sameRow = (a: object, b: object) => {
  const entries = (o: object) =>
    Object.entries(o)
      .filter(([k]) => !["_id", "_creationTime", "userId"].includes(k))
      .sort(([x], [y]) => x.localeCompare(y))
  return JSON.stringify(entries(a)) === JSON.stringify(entries(b))
}

export const sync = async <T extends Table>(
  ctx: MutationCtx,
  table: T,
  current: Doc<T>[],
  next: Row<T>[],
  sliceOf: (row: Row<T>) => string,
  insert: (row: Row<T>) => Promise<unknown>
) => {
  for (const slice of new Set([...current, ...next].map(sliceOf))) {
    const before = current.filter((row) => sliceOf(row) === slice)
    const after = next.filter((row) => sliceOf(row) === slice)
    if (before.length === after.length && before.every((row, i) => sameRow(row, after[i]!)))
      continue
    for (const row of before) await ctx.db.delete(table, row._id)
    for (const row of after) await insert(row)
  }
}

export const formNow = async (ctx: QueryCtx, userId: Id<"users">) =>
  formOf(
    (await rowOf(ctx, userId))?.workMode ?? "any",
    await tagsOf(ctx, userId),
    await entriesOf(ctx, userId, "answer")
  )

export const writeAnswers = async (
  ctx: MutationCtx,
  userId: Id<"users">,
  form: typeof Preferences.infer,
  { byAgent = false }: { byAgent?: boolean } = {}
) => {
  await upsert(ctx, userId, { workMode: form.workMode })
  await sync(
    ctx,
    "preferenceTags",
    await tagsOf(ctx, userId),
    tagRowsOf(form),
    (r) => r.kind,
    (row) => ctx.db.insert("preferenceTags", { ...row, userId })
  )
  const current = await entriesOf(ctx, userId, "answer")
  await sync(
    ctx,
    "profileEntries",
    current,
    answerRowsOf(form).map((row) => {
      const had = current.find(
        (c) => c.key === row.key && c.label === row.label && c.value === row.value
      )
      return byAgent && (!had || had.byAgent) ? { ...row, byAgent: true } : row
    }),
    (r) => r.key,
    (row) => ctx.db.insert("profileEntries", { ...row, userId })
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
    await entriesOf(ctx, userId, "field"),
    fieldRowsOf(sections),
    (r) => `${sectionOfOrder(r.order)}:${r.group}`,
    (row) => ctx.db.insert("profileEntries", { ...row, userId })
  )
}

export const markOnboarded = async (ctx: MutationCtx, userId: Id<"users">) => {
  const user = await ctx.db.get("users", userId)
  if (user && user.onboardedAt === undefined)
    await ctx.db.patch("users", userId, { onboardedAt: Date.now() })
}

export const deleteResumeFile = async (ctx: MutationCtx, userId: Id<"users">) => {
  const row = await rowOf(ctx, userId)
  if (row?.resumeId) await ctx.storage.delete(row.resumeId)
}
