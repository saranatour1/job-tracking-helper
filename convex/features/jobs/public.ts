import { getAuthUserId } from "@convex-dev/auth/server"
import { paginationResultValidator } from "convex/server"
import { ConvexError, type ObjectType, v } from "convex/values"
import type { Doc } from "../../_generated/dataModel"
import { query } from "../../_generated/server"
import { sessionMutation } from "../../lib/functions"
import { limits } from "../workflows/manager"
import { evidenceOf } from "./companies"
import { catalogCounts } from "./counts"
import { vCatalogSummary, vFacts, vJobRow, vJobSearchArgs } from "./validators"
import { rowOf, searchJobs } from "./utils"

// The page size the app asks for. Signed out, nobody can ask for more.
const publicPage = 25

const wordsOf = (q: string | undefined) => q?.trim().slice(0, 200)

// Anyone without a real account gets the same filters, but no verdicts, 25 at a time, and words
// only once they've spent a daily search on them (allowSearch).
const visitorArgs = (
  user: Doc<"users"> | null,
  { q, remoteOnly, boardId, since, paginationOpts }: ObjectType<typeof vJobSearchArgs>
) => {
  const words = wordsOf(q)
  return {
    q: words && words === user?.allowedSearch ? words : undefined,
    remoteOnly,
    boardId,
    since,
    paginationOpts: { ...paginationOpts, numItems: Math.min(paginationOpts.numItems, publicPage) },
  }
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
        : await searchJobs(ctx, null, visitorArgs(user || null, args))
    const evidence = await evidenceOf(ctx, found.page)
    const page = found.page.map(({ boardId: _, ...row }, i) => ({ ...row, evidence: evidence[i]! }))
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
  returns: v.union(
    vJobRow.extend({ text: v.string(), facts: v.union(vFacts, v.null()) }),
    v.null()
  ),
  handler: async (ctx, { id }) => {
    const jobId = ctx.db.normalizeId("jobs", id)
    const job = jobId && (await ctx.db.get("jobs", jobId))
    if (!job) return null
    const { boardId: _, ...row } = rowOf(job, null)
    const [evidence] = await evidenceOf(ctx, [job])
    return { ...row, text: job.text, facts: job.facts ?? null, evidence: evidence! }
  },
})

const companies = query({
  args: {},
  returns: v.array(
    v.object({
      boardId: v.id("jobBoards"),
      company: v.string(),
      domain: v.union(v.string(), v.null()),
      jobs: v.number(),
    })
  ),
  handler: async (ctx) => {
    const boards = await ctx.db
      .query("jobBoards")
      .withIndex("by_jobs", (q) => q.gt("jobs", 0))
      .order("desc")
      .take(200)
    boards.sort((a, b) => b.jobs - a.jobs || a.company.localeCompare(b.company))
    const rows = []
    for (const b of boards) {
      const company = b.companyId ? await ctx.db.get("companies", b.companyId) : null
      rows.push({
        boardId: b._id,
        company: b.company,
        domain: company?.domain ?? null,
        jobs: b.jobs,
      })
    }
    return rows
  },
})

// Null until it's first counted.
const stats = query({
  args: {},
  returns: v.union(
    v.object({ boards: v.number(), jobs: v.number(), summary: vCatalogSummary }),
    v.null()
  ),
  handler: async (ctx) => {
    const row = await ctx.db.query("jobCatalog").first()
    return row && { boards: row.boards, ...(await catalogCounts(ctx)) }
  },
})

export const publicApi = { search, allowSearch, posting, stats, companies }
