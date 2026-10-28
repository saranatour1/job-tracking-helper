import { paginationOptsValidator, paginationResultValidator } from "convex/server"
import { v } from "convex/values"
import { authedQuery } from "../../../lib/functions"
import { previewOf } from "./boards"
import { vJobRow } from "./validators"

// Every role in the catalog, newest first, or the best matches for the search words.
// Each row carries the fit a loop gave it for this person, if one has.
const search = authedQuery({
  args: {
    q: v.optional(v.string()),
    remoteOnly: v.optional(v.boolean()),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(vJobRow),
  handler: async (ctx, { q, remoteOnly, paginationOpts }) => {
    const words = q?.trim().slice(0, 200)
    const jobs = ctx.db.query("jobs")
    const page = words
      ? await jobs
          .withSearchIndex("search_text", (s) =>
            remoteOnly ? s.search("text", words).eq("remote", true) : s.search("text", words)
          )
          .paginate(paginationOpts)
      : remoteOnly
        ? await jobs
            .withIndex("by_remote_and_postedAt", (i) => i.eq("remote", true))
            .order("desc")
            .paginate(paginationOpts)
        : await jobs.withIndex("by_postedAt").order("desc").paginate(paginationOpts)
    const rows = []
    for (const job of page.page) {
      const lead = await ctx.db
        .query("jobLeads")
        .withIndex("by_userId_and_urlKey", (i) =>
          i.eq("userId", ctx.userId).eq("urlKey", job.urlKey)
        )
        .first()
      rows.push({
        _id: job._id,
        url: job.url,
        title: job.title,
        company: job.company,
        location: job.location,
        remote: job.remote,
        postedAt: job.postedAt,
        preview: previewOf(job.text),
        fit: lead?.fit ?? null,
        verdict: lead?.verdict ?? null,
      })
    }
    return { ...page, page: rows }
  },
})

// How big the catalog is, from each board's last fetch.
const stats = authedQuery({
  args: {},
  returns: v.object({ boards: v.number(), jobs: v.number() }),
  handler: async (ctx) => {
    const boards = await ctx.db.query("jobBoards").take(1000)
    return { boards: boards.length, jobs: boards.reduce((n, b) => n + b.jobs, 0) }
  },
})

export const publicApi = { search, stats }
