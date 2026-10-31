import { paginationResultValidator } from "convex/server"
import { v } from "convex/values"
import { authedQuery } from "../../lib/functions"
import { evidenceOf } from "./companies"
import { vJobRow, vJobSearchArgs } from "./validators"
import { searchJobs } from "./utils"

const search = authedQuery({
  args: vJobSearchArgs,
  returns: paginationResultValidator(vJobRow),
  handler: async (ctx, args) => {
    const found = await searchJobs(ctx, ctx.userId, args)
    const page = []
    for (const row of found.page) page.push({ ...row, evidence: await evidenceOf(ctx, row._id) })
    return { ...found, page }
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
const stats = authedQuery({
  args: {},
  returns: v.union(v.object({ boards: v.number(), jobs: v.number() }), v.null()),
  handler: async (ctx) => {
    const row = await ctx.db.query("jobCatalog").first()
    return row && { boards: row.boards, jobs: row.jobs }
  },
})

export const publicApi = { search, stats, companies }
