import type { Doc } from "../../_generated/dataModel"
import type { MutationCtx } from "../../_generated/server"
import { previewOf } from "./boards"

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

// Boards are fetched about once a day; the hourly cron queues those due.
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
