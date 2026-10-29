import { TableAggregate } from "@convex-dev/aggregate"
import { components } from "../../../_generated/api"
import type { DataModel, Doc, Id } from "../../../_generated/dataModel"
import type { MutationCtx, QueryCtx } from "../../../_generated/server"
import { runStatuses } from "./models"

// Counters for each workflow's runs, bucketed by how they ended, so "12 runs, 2 failed"
// is a few reads however many runs there are. Every write to automationRuns that adds,
// removes or changes a run's status goes through here, in the same mutation.
export const runCounts = new TableAggregate<{
  Namespace: Id<"automations">
  Key: string
  DataModel: DataModel
  TableName: "automationRuns"
}>(components.automationRunCounts, {
  namespace: (run) => run.automationId,
  sortKey: (run) => run.status,
})

/** Inserts a run and counts it. */
export const insertRun = async (
  ctx: MutationCtx,
  run: Omit<Doc<"automationRuns">, "_id" | "_creationTime">
) => {
  const id = await ctx.db.insert("automationRuns", run)
  await runCounts.insert(ctx, (await ctx.db.get("automationRuns", id))!)
  return id
}

/** Changes a run's status, and moves it to that bucket. */
export const patchRun = async (
  ctx: MutationCtx,
  run: Doc<"automationRuns">,
  patch: Partial<Omit<Doc<"automationRuns">, "_id" | "_creationTime">>
) => {
  await ctx.db.patch("automationRuns", run._id, patch)
  if (patch.status && patch.status !== run.status)
    await runCounts.replace(ctx, run, (await ctx.db.get("automationRuns", run._id))!)
}

/** Deletes a run and stops counting it. */
export const deleteRun = async (ctx: MutationCtx, run: Doc<"automationRuns">) => {
  await runCounts.deleteIfExists(ctx, run)
  await ctx.db.delete("automationRuns", run._id)
}

/** How many of a workflow's runs are in each state. */
export const countsOf = async (ctx: QueryCtx, automationId: Id<"automations">) => {
  const counts = await runCounts.countBatch(
    ctx,
    runStatuses.map((status) => ({
      namespace: automationId,
      bounds: { lower: { key: status, inclusive: true }, upper: { key: status, inclusive: true } },
    }))
  )
  return Object.fromEntries(runStatuses.map((status, i) => [status, counts[i] ?? 0])) as Record<
    (typeof runStatuses)[number],
    number
  >
}
