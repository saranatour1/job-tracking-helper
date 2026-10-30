import type { Doc } from "../../_generated/dataModel"
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
