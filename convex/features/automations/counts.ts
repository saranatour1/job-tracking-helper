import { DirectAggregate, TableAggregate } from "@convex-dev/aggregate"
import { components } from "../../_generated/api"
import type { DataModel, Doc, Id } from "../../_generated/dataModel"
import type { MutationCtx, QueryCtx } from "../../_generated/server"
import { runStatuses, type Step, stepAt } from "./validators"

export const runCounts = new TableAggregate<{
  Namespace: Id<"automations">
  Key: string
  DataModel: DataModel
  TableName: "automationRuns"
}>(components.automationRunCounts, {
  namespace: (run) => run.automationId,
  sortKey: (run) => run.status,
})

export const choiceCounts = new DirectAggregate<{
  Namespace: Id<"automations">
  Key: [string, string]
  Id: string
}>(components.automationChoices)

export const choiceKeyOf = (steps: Step[], at: string) => {
  const step = stepAt(steps, at)
  return step?.kind === "decide" ? step.id : at
}

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

export const choicesOf = async (ctx: QueryCtx, automationId: Id<"automations">, steps: Step[]) => {
  const pairs = steps.flatMap((step, i) =>
    step.kind === "decide"
      ? step.paths.map((p) => ({ at: String(i), key: step.id, answer: p.label }))
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

export const insertRun = async (
  ctx: MutationCtx,
  run: Omit<Doc<"automationRuns">, "_id" | "_creationTime">
) => {
  const id = await ctx.db.insert("automationRuns", run)
  await runCounts.insert(ctx, (await ctx.db.get("automationRuns", id))!)
  return id
}

export const patchRun = async (
  ctx: MutationCtx,
  run: Doc<"automationRuns">,
  patch: Partial<Omit<Doc<"automationRuns">, "_id" | "_creationTime">>
) => {
  await ctx.db.patch("automationRuns", run._id, patch)
  if (patch.status && patch.status !== run.status)
    await runCounts.replace(ctx, run, (await ctx.db.get("automationRuns", run._id))!)
}

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
