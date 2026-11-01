import { getAuthUserId } from "@convex-dev/auth/server"
import { paginationResultValidator } from "convex/server"
import { ConvexError, type ObjectType, v } from "convex/values"
import type { Doc } from "../../_generated/dataModel"
import { query, type QueryCtx } from "../../_generated/server"
import { authedQuery, sessionMutation } from "../../lib/functions"
import { limits } from "../workflows/manager"
import { evidenceOf } from "./companies"
import { vJobRow, vJobSearchArgs } from "./validators"
import { rowOf, searchJobs } from "./utils"

// The page size the app asks for. Signed out, nobody can ask for more.
const publicPage = 25

const wordsOf = (q: string | undefined) => q?.trim().slice(0, 200)

// The catalog for anyone without a real account: the newest roles, or the one search they've
// spent a daily search on (allowSearch). It never reads anyone's verdicts.
const browse = async (
  ctx: QueryCtx,
  user: Doc<"users"> | null,
  { q, paginationOpts }: ObjectType<typeof vJobSearchArgs>
) => {
  const words = wordsOf(q)
  const opts = { ...paginationOpts, numItems: Math.min(paginationOpts.numItems, publicPage) }
  const jobs = ctx.db.query("jobs")
  const found =
    words && words === user?.allowedSearch
      ? await jobs.withSearchIndex("search_text", (s) => s.search("text", words)).paginate(opts)
      : await jobs.withIndex("by_postedAt").order("desc").paginate(opts)
  return { ...found, page: found.page.map((job) => rowOf(job, null)) }
}

const search = query({
  args: vJobSearchArgs,
  returns: paginationResultValidator(vJobRow),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx)
    const user = userId && (await ctx.db.get("users", userId))
    const found =
      user && !user.anonymous
        ? await searchJobs(ctx, user._id, args)
        : await browse(ctx, user, args)
    const page = []
    for (const row of found.page) page.push({ ...row, evidence: await evidenceOf(ctx, row._id) })
    return { ...found, page }
  },
})

// Queries can't write, so an anonymous search is counted here and `search` only honors what this
// allowed. Running the same search again, or showing more of it, costs nothing.
const allowSearch = sessionMutation({
  args: { q: v.string() },
  returns: v.null(),
  handler: async (ctx, { q }) => {
    const user = await ctx.db.get("users", ctx.userId)
    const words = wordsOf(q)
    if (!user?.anonymous || !words || words === user.allowedSearch) return null
    const { ok } = await limits.limit(ctx, "anonymousSearch", { key: ctx.userId })
    if (!ok) throw new ConvexError("That's 10 searches today. Sign in to keep searching.")
    await ctx.db.patch("users", ctx.userId, { allowedSearch: words })
    return null
  },
})

// One role for its public page and link preview, so never anyone's verdict. Null once it's gone.
const posting = query({
  args: { id: v.string() },
  returns: v.union(vJobRow.extend({ text: v.string() }), v.null()),
  handler: async (ctx, { id }) => {
    const jobId = ctx.db.normalizeId("jobs", id)
    const job = jobId && (await ctx.db.get("jobs", jobId))
    if (!job) return null
    return { ...rowOf(job, null), text: job.text, evidence: await evidenceOf(ctx, job._id) }
  },
})

const companies = authedQuery({
  args: {},
  returns: v.array(v.object({ boardId: v.id("jobBoards"), company: v.string(), jobs: v.number() })),
  handler: async (ctx) =>
    (
      await ctx.db
        .query("jobBoards")
        .withIndex("by_jobs", (q) => q.gt("jobs", 0))
        .order("desc")
        .take(200)
    )
      .sort((a, b) => b.jobs - a.jobs || a.company.localeCompare(b.company))
      .map((b) => ({ boardId: b._id, company: b.company, jobs: b.jobs })),
})

// Null until it's first counted.
const stats = query({
  args: {},
  returns: v.union(v.object({ boards: v.number(), jobs: v.number() }), v.null()),
  handler: async (ctx) => {
    const row = await ctx.db.query("jobCatalog").first()
    return row && { boards: row.boards, jobs: row.jobs }
  },
})

export const publicApi = { search, allowSearch, posting, stats, companies }
