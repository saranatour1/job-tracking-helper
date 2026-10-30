import { paginationOptsValidator, paginationResultValidator } from "convex/server"
import { v } from "convex/values"
import type { Doc } from "../../_generated/dataModel"
import { authedQuery } from "../../lib/functions"
import { previewOf } from "./boards"
import { vJobRow } from "./validators"

// Every role in the catalog, newest first, or the best matches for the search words,
// narrowed by remote, one company's board, and how recently it was posted. With `fits`,
// only roles Jev said fit this person, best first. Each row carries the fit a loop or a
// pasted link gave it for this person, if one has.
const search = authedQuery({
  args: {
    q: v.optional(v.string()),
    remoteOnly: v.optional(v.boolean()),
    // A string, since it comes from the address; a bad one finds nothing instead of throwing.
    boardId: v.optional(v.string()),
    // Posted at or after this time; the page rounds it to the hour so it caches.
    since: v.optional(v.number()),
    fits: v.optional(v.boolean()),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(vJobRow),
  handler: async (ctx, { q, remoteOnly, boardId, since, fits, paginationOpts }) => {
    const board = boardId ? ctx.db.normalizeId("jobBoards", boardId) : null
    if (boardId && !board) return { page: [], isDone: true, continueCursor: "" }
    const words = q?.trim().slice(0, 200)
    const keep = (job: Doc<"jobs">) =>
      (!remoteOnly || job.remote) &&
      (!board || job.boardId === board) &&
      (since === undefined || job.postedAt >= since)

    if (fits) {
      // Best first across every page; the other filters only thin each page out.
      const page = await ctx.db
        .query("jobLeads")
        .withIndex("by_userId_and_verdict_and_fit", (i) =>
          i.eq("userId", ctx.userId).eq("verdict", "fit")
        )
        .order("desc")
        .paginate(paginationOpts)
      const rows = []
      for (const lead of page.page) {
        const job = lead.jobId && (await ctx.db.get("jobs", lead.jobId))
        if (!job || !keep(job)) continue
        const said = `${job.title} ${job.company} ${job.location}`.toLowerCase()
        if (
          words &&
          !words
            .toLowerCase()
            .split(/\s+/)
            .every((w) => said.includes(w))
        )
          continue
        rows.push(rowOf(job, lead))
      }
      return { ...page, page: rows }
    }

    const jobs = ctx.db.query("jobs")
    const page = words
      ? await jobs
          .withSearchIndex("search_text", (s) => {
            const found = s.search("text", words)
            const remote = remoteOnly ? found.eq("remote", true) : found
            return board ? remote.eq("boardId", board) : remote
          })
          // After the search index, which only ranks Convex's top 1024 matches, so very
          // common words with "Posted" can miss recent roles that ranked lower.
          .filter((f) => (since === undefined ? true : f.gte(f.field("postedAt"), since)))
          .paginate(paginationOpts)
      : board
        ? await jobs
            .withIndex("by_boardId_and_postedAt", (i) =>
              since === undefined
                ? i.eq("boardId", board)
                : i.eq("boardId", board).gte("postedAt", since)
            )
            .order("desc")
            .filter((f) => (remoteOnly ? f.eq(f.field("remote"), true) : true))
            .paginate(paginationOpts)
        : remoteOnly
          ? await jobs
              .withIndex("by_remote_and_postedAt", (i) =>
                since === undefined
                  ? i.eq("remote", true)
                  : i.eq("remote", true).gte("postedAt", since)
              )
              .order("desc")
              .paginate(paginationOpts)
          : await jobs
              .withIndex("by_postedAt", (i) => (since === undefined ? i : i.gte("postedAt", since)))
              .order("desc")
              .paginate(paginationOpts)
    const rows = []
    for (const job of page.page) {
      const lead = await ctx.db
        .query("jobLeads")
        .withIndex("by_userId_and_urlKey", (i) =>
          i.eq("userId", ctx.userId).eq("urlKey", job.urlKey)
        )
        .first()
      rows.push(rowOf(job, lead))
    }
    return { ...page, page: rows }
  },
})

const rowOf = (job: Doc<"jobs">, lead: Doc<"jobLeads"> | null) => ({
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

// The companies with the most open roles, for the company filter.
const companies = authedQuery({
  args: {},
  returns: v.array(v.object({ boardId: v.id("jobBoards"), company: v.string(), jobs: v.number() })),
  handler: async (ctx) =>
    (await ctx.db.query("jobBoards").take(1000))
      .filter((b) => b.jobs > 0)
      .sort((a, b) => b.jobs - a.jobs || a.company.localeCompare(b.company))
      .slice(0, 200)
      .map((b) => ({ boardId: b._id, company: b.company, jobs: b.jobs })),
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

export const publicApi = { search, stats, companies }
