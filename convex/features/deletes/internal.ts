import { defineBatchWorkerValidators } from "@convex-dev/batch-worker"
import { v } from "convex/values"
import { components } from "../../_generated/api"
import type { Doc, TableNames } from "../../_generated/dataModel"
import { internalMutation, internalQuery, type QueryCtx } from "../../_generated/server"
import { workLog } from "../../lib/log"
import { keepLog } from "../activity/utils"
import { batch as applicationBatch, deleteApplication } from "../applications/utils"
import { deleteWorkflow } from "../automations/utils"
import { judgedWorker } from "../loops/judged"
import { workerName } from "./utils"

const batchSize = 200
const activityBatch = 500
const workflowBatch = 5
const stuckAfterMs = 15 * 60 * 1000

const accountTables: { table: TableNames; index: string; size?: number }[] = [
  { table: "automations", index: "by_userId", size: workflowBatch },
  { table: "applications", index: "by_userId" },
  { table: "preferences", index: "by_userId" },
  { table: "preferenceTags", index: "by_userId_and_kind_and_order" },
  { table: "profileEntries", index: "by_userId_and_kind_and_order" },
  { table: "loops", index: "by_userId" },
  { table: "loopRuns", index: "by_userId_and_startedAt" },
  { table: "jobLeads", index: "by_userId_and_status" },
  { table: "prefills", index: "by_userId" },
  { table: "mailEvents", index: "by_userId_and_applicationId_and_at" },
  { table: "contacts", index: "by_userId_and_lastAt" },
  { table: "mailLabels", index: "by_userId_and_name" },
  { table: "mailEventLabels", index: "by_userId_and_label_and_at" },
  { table: "mailDrafts", index: "by_userId_and_updatedAt" },
  { table: "mailTemplates", index: "by_userId_and_updatedAt" },
  { table: "activityEvents", index: "by_userId_and_at" },
  { table: "views", index: "by_userId" },
  { table: "goals", index: "by_userId" },
  { table: "calendarEvents", index: "by_userId_and_key" },
  { table: "calendarSettings", index: "by_userId" },
]

const { vQueryArgs, vQueryReturns, vMutationArgs, vMutationReturns } = defineBatchWorkerValidators({
  batch: {
    jobId: v.id("deleteJobs"),
    table: v.string(),
    ids: v.array(v.string()),
    step: v.number(),
  },
})

const rowsOf = (
  ctx: QueryCtx,
  job: Doc<"deleteJobs">,
  table: string,
  index: string,
  size: number
) =>
  ctx.db
    .query(table as "goals")
    .withIndex(index as "by_userId", (q) => q.eq("userId", job.userId!))
    // Signing back in reuses the user id, so what's new isn't part of this delete.
    .filter((q) => q.lte(q.field("_creationTime"), job.before))
    .take(size)

const nextOf = async (ctx: QueryCtx, job: Doc<"deleteJobs">) => {
  if (job.kind === "account") {
    for (let step = job.step; step < accountTables.length; step++) {
      const { table, index, size = batchSize } = accountTables[step]!
      const rows = await rowsOf(ctx, job, table, index, size)
      if (rows.length) return { table, ids: rows.map((r) => r._id as string), step }
    }
    return { table: "", ids: [], step: job.step }
  }
  if (job.kind === "oldActivity") {
    const rows = await ctx.db
      .query("activityEvents")
      .withIndex("by_at", (q) => q.lt("at", job.before))
      .take(activityBatch)
    return { table: "activityEvents", ids: rows.map((r) => r._id as string), step: 0 }
  }
  const rows =
    job.kind === "trash"
      ? await ctx.db
          .query("applications")
          .withIndex("by_userId_and_trashedAt", (q) =>
            q.eq("userId", job.userId!).gt("trashedAt", 0)
          )
          .take(applicationBatch)
      : await ctx.db
          .query("applications")
          .withIndex("by_purgeAt", (q) => q.gt("purgeAt", 0).lte("purgeAt", job.before))
          .take(applicationBatch)
  return { table: "applications", ids: rows.map((r) => r._id as string), step: 0 }
}

// shortcut: no cursor, so each scan passes over rows just deleted. Fine at a few hundred per
// person; add one if an account ever holds hundreds of thousands.
const nextBatch = internalQuery({
  args: vQueryArgs,
  returns: vQueryReturns,
  handler: async (ctx) => {
    const job = await ctx.db.query("deleteJobs").first()
    if (!job) return { kind: "idle" as const }
    return { kind: "work" as const, batch: { jobId: job._id, ...(await nextOf(ctx, job)) } }
  },
})

const deleteBatch = internalMutation({
  args: vMutationArgs,
  returns: vMutationReturns,
  handler: async (ctx, { jobId, table, ids, step }) => {
    const job = await ctx.db.get("deleteJobs", jobId)
    if (!job) return
    const log = workLog("delete.job", {
      kind: job.kind,
      ...(job.userId && { userId: job.userId }),
    })
    try {
      for (const id of ids) {
        const rowId = ctx.db.normalizeId(table as "goals", id)
        const row = rowId && (await ctx.db.get(table as "goals", rowId))
        if (!row) continue
        if (table === "automations") await deleteWorkflow(ctx, row as unknown as Doc<"automations">)
        else if (table === "applications" && job.kind !== "account") {
          const application = row as unknown as Doc<"applications">
          if (
            job.kind === "trash"
              ? application.trashedAt !== undefined
              : (application.purgeAt ?? Infinity) <= job.before
          )
            await deleteApplication(ctx, application)
        } else await ctx.db.delete(table as "goals", row._id)
      }
    } catch (cause) {
      log.set({ outcome: "failed", table, summary: "A big delete stopped partway" })
      log.error(cause as Error)
      await ctx.db.delete("deleteJobs", jobId)
      if (job.kind === "account") log.emit()
      else await keepLog(ctx, log)
      return
    }
    if (ids.length === 0) {
      await ctx.db.delete("deleteJobs", jobId)
      log.set({ outcome: "done" })
      log.emit()
    } else if (step !== job.step) await ctx.db.patch("deleteJobs", jobId, { step })
  },
})

// A batch worker can be left marked as running with nothing behind it, and then ignores pings
// (get-convex/batch-worker#12). shortcut: drop this once that's fixed upstream.
const restartIfStuck = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const waitedTooLong = (row: { _creationTime: number } | null) =>
      row !== null && row._creationTime < Date.now() - stuckAfterMs
    if (waitedTooLong(await ctx.db.query("deleteJobs").first()))
      await ctx.runMutation(components.batchWorker.lib.kick, { name: workerName })
    if (waitedTooLong(await ctx.db.query("judgedReads").first()))
      await ctx.runMutation(components.batchWorker.lib.kick, { name: judgedWorker })
    return null
  },
})

export const deletesApi = { nextBatch, deleteBatch, restartIfStuck }
