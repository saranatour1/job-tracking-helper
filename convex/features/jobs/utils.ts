import type { ObjectType } from "convex/values"
import type { Doc, Id } from "../../_generated/dataModel"
import type { MutationCtx, QueryCtx } from "../../_generated/server"
import { previewOf } from "./links"
import type { vJobSearchArgs } from "./validators"

export const rowOf = (job: Doc<"jobs">, lead: Doc<"jobLeads"> | null) => ({
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

export const searchJobs = async (
  ctx: QueryCtx,
  userId: Id<"users">,
  { q, remoteOnly, boardId, since, fits, paginationOpts }: ObjectType<typeof vJobSearchArgs>
) => {
  const board = boardId ? ctx.db.normalizeId("jobBoards", boardId) : null
  if (boardId && !board) return { page: [], isDone: true, continueCursor: "" }
  const words = q?.trim().slice(0, 200)
  const keep = (job: Doc<"jobs">) =>
    (!remoteOnly || job.remote) &&
    (!board || job.boardId === board) &&
    (since === undefined || job.postedAt >= since)

  if (fits) {
    const page = await ctx.db
      .query("jobLeads")
      .withIndex("by_userId_and_verdict_and_fit", (i) =>
        i.eq("userId", userId).eq("verdict", "fit")
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
      .withIndex("by_userId_and_urlKey", (i) => i.eq("userId", userId).eq("urlKey", job.urlKey))
      .first()
    rows.push(rowOf(job, lead))
  }
  return { ...page, page: rows }
}

export const refreshEvery = 20 * 60 * 60 * 1000

/** Keeps the catalog's totals, after a write to `jobBoards`, in the same mutation. The first
 * time, there's nothing to add to, so it counts what's there. */
export const countCatalog = async (
  ctx: MutationCtx,
  change: { boards?: number; jobs?: number }
) => {
  const row = await ctx.db.query("jobCatalog").first()
  if (row) {
    await ctx.db.patch("jobCatalog", row._id, {
      boards: row.boards + (change.boards ?? 0),
      jobs: row.jobs + (change.jobs ?? 0),
    })
    return
  }
  const total = { boards: 0, jobs: 0 }
  for await (const board of ctx.db.query("jobBoards")) {
    total.boards++
    total.jobs += board.jobs
  }
  await ctx.db.insert("jobCatalog", total)
}
