import { defineBatchWorkerValidators, ping } from "@convex-dev/batch-worker"
import type { WorkflowId } from "@convex-dev/workflow"
import { vOnCompleteArgs } from "@convex-dev/workpool"
import { v } from "convex/values"
import { components, internal } from "../../_generated/api"
import type { Doc, Id } from "../../_generated/dataModel"
import { internalMutation, internalQuery } from "../../_generated/server"
import { workflow } from "../workflows/manager"
import { vJudgeResult } from "../workflows/validators"

export const judgedWorker = "judged"

const batchSize = 25

// Up to 8 judgments finish at once. Each writing to the run directly fails with conflicts, so
// each leaves its own row, and one worker adds them to the run.
const judged = internalMutation({
  args: vOnCompleteArgs(v.object({ runId: v.id("loopRuns") }), vJudgeResult),
  returns: v.null(),
  handler: async (ctx, { context, result }) => {
    const done = result.kind === "success" ? result.returnValue : undefined
    await ctx.db.insert("judgedReads", {
      runId: context.runId,
      failed: !done,
      cost: done?.cost ?? 0,
      ...(done?.judged && { judged: done.judged }),
    })
    await ping(ctx, components.batchWorker, {
      name: judgedWorker,
      workQuery: internal.api.loops.nextJudged,
      workerMutation: internal.api.loops.addJudged,
    })
    return null
  },
})

const { vQueryArgs, vQueryReturns, vMutationArgs, vMutationReturns } = defineBatchWorkerValidators({
  batch: { ids: v.array(v.id("judgedReads")) },
})

// shortcut: no cursor, so each scan passes over rows just deleted. A run has at most a few
// hundred, so it stays small; add one if runs get far bigger.
const nextJudged = internalQuery({
  args: vQueryArgs,
  returns: vQueryReturns,
  handler: async (ctx) => {
    const rows = await ctx.db.query("judgedReads").take(batchSize)
    if (rows.length === 0) return { kind: "idle" as const }
    return { kind: "work" as const, batch: { ids: rows.map((r) => r._id) } }
  },
})

const addJudged = internalMutation({
  args: vMutationArgs,
  returns: vMutationReturns,
  handler: async (ctx, { ids }) => {
    const byRun = new Map<Id<"loopRuns">, Doc<"judgedReads">[]>()
    for (const id of ids) {
      const row = await ctx.db.get("judgedReads", id)
      if (!row) continue
      byRun.set(row.runId, [...(byRun.get(row.runId) ?? []), row])
      await ctx.db.delete("judgedReads", id)
    }
    for (const [runId, rows] of byRun) {
      const run = await ctx.db.get("loopRuns", runId)
      // Stopped since, so nothing's waiting on these.
      if (!run?.readsLeft) continue
      const judgedHere = rows.flatMap((r) => r.judged ?? [])
      const readsLeft = Math.max(0, run.readsLeft - rows.length)
      await ctx.db.patch("loopRuns", runId, {
        readsLeft,
        scanned: run.scanned + judgedHere.length,
        cost: (run.cost ?? 0) + rows.reduce((sum, r) => sum + r.cost, 0),
        readFailures: (run.readFailures ?? 0) + rows.filter((r) => r.failed).length,
        candidates: [...(run.candidates ?? []), ...judgedHere],
      })
      if (readsLeft === 0 && run.workflowId)
        await workflow.sendEvent(ctx, {
          workflowId: run.workflowId as WorkflowId,
          name: "judged",
        })
    }
  },
})

export const judgedApi = { judged, nextJudged, addJudged }
