import { DirectAggregate, TableAggregate } from "@convex-dev/aggregate"
import { components } from "../../_generated/api"
import type { DataModel, Doc, Id } from "../../_generated/dataModel"
import type { MutationCtx, QueryCtx } from "../../_generated/server"
import { runStatuses, type Step, stepAt } from "./validators"

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

// Ask Jev's answers, bucketed per workflow by step and answer, for "Yes · 12" on the
// canvas. One entry per run and step. A step is known by its id, or by its place if it
// was saved before steps had one.
export const choiceCounts = new DirectAggregate<{
  Namespace: Id<"automations">
  Key: [string, string]
  Id: string
}>(components.automationChoices)

/** What an Ask Jev step's counts are filed under. */
export const choiceKeyOf = (steps: Step[], at: string) => {
  const step = stepAt(steps, at)
  return (step?.kind === "decide" && step.id) || at
}

/** Counts the answer Jev gave at a run's step. */
export const recordChoice = (
  ctx: MutationCtx,
  run: Doc<"automationRuns">,
  at: string,
  choice: string
) =>
  choiceCounts.insertIfDoesNotExist(ctx, {
    namespace: run.automationId,
    key: [choiceKeyOf(run.steps, at), choice],
    id: `${run._id}#${at}`,
  })

/** How often Jev gave each answer at each Ask Jev step of a workflow as it is now, by
 * place then answer. */
export const choicesOf = async (ctx: QueryCtx, automationId: Id<"automations">, steps: Step[]) => {
  const pairs = steps.flatMap((step, i) =>
    step.kind === "decide"
      ? step.paths.map((p) => ({ at: String(i), key: step.id || String(i), answer: p.label }))
      : []
  )
  if (!pairs.length) return {}
  const counts = await choiceCounts.countBatch(
    ctx,
    pairs.map(({ key, answer }) => ({
      namespace: automationId,
      bounds: { prefix: [key, answer] as [string, string] },
    }))
  )
  const out: Record<string, Record<string, number>> = {}
  pairs.forEach(({ at, answer }, i) => {
    out[at] = { ...out[at], [answer]: counts[i] ?? 0 }
  })
  return out
}

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

/** Deletes runs, stops counting them, and takes their Updates lines with them. */
export const deleteRuns = async (ctx: MutationCtx, runs: Doc<"automationRuns">[]) => {
  for (const run of runs) {
    await runCounts.deleteIfExists(ctx, run)
    for (const entry of run.log)
      if (entry.choice)
        await choiceCounts.deleteIfExists(ctx, {
          namespace: run.automationId,
          key: [choiceKeyOf(run.steps, entry.at), entry.choice],
          id: `${run._id}#${entry.at}`,
        })
    await ctx.db.delete("automationRuns", run._id)
  }
  const owner = runs[0]?.userId
  if (owner)
    await ctx.runMutation(components.notifications.lib.forget, {
      owner,
      prefixes: runs.map((r) => `${r._id}#`),
    })
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
