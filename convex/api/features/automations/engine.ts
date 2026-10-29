import { vResultValidator, vWorkflowId, type WorkflowId } from "@convex-dev/workflow"
import { ConvexError, type Infer, v } from "convex/values"
import { components, internal } from "../../../_generated/api"
import type { Doc } from "../../../_generated/dataModel"
import { internalMutation, internalQuery, type MutationCtx } from "../../../_generated/server"
import { limits as applicationLimits } from "../applications/validators"
import { workflow } from "../workflows/manager"
import { insertRun, patchRun } from "./counts"
import type { vLogEntry } from "./models"
import { type Block, fill, nextScheduledAt, stepAt } from "./validators"

type LogEntry = Infer<typeof vLogEntry>

// One interpreter runs every workflow anyone builds. It walks the run's copy of the
// steps: a block is one mutation, a wait sleeps inside the workflow (free while it
// waits), and a split runs its paths side by side, going on once every path is done.
// A step that can't run records why, and the run stops there.
const run = workflow.define({
  args: { runId: v.id("automationRuns") },
  handler: async (step, { runId }): Promise<void> => {
    const shape = await step.runQuery(internal.automations.shapeOf, { runId })
    // Runs one block; returns why it couldn't run, if it couldn't.
    const runAt = async (at: string) => {
      const { waitMs, error } = await step.runMutation(internal.automations.runStep, { runId, at })
      if (error) return error
      if (waitMs > 0) {
        await step.sleep(waitMs, { name: `wait ${at}` })
        await step.runMutation(internal.automations.finishStep, { runId, at })
      }
      return undefined
    }
    for (const [i, paths] of shape.entries()) {
      if (paths === null) {
        const error = await runAt(String(i))
        if (error) throw new Error(error)
        continue
      }
      await step.runMutation(internal.automations.startSplit, { runId, at: String(i) })
      // A path that fails stops there, but the others finish first: a step left running
      // would try to wake a run that's already over.
      const errors = await Promise.all(
        paths.map(async (length, p) => {
          for (let j = 0; j < length; j++) {
            const error = await runAt(`${i}.${p}.${j}`)
            if (error) return error
          }
          return undefined
        })
      )
      const error = errors.find((e) => e !== undefined)
      if (error) throw new Error(error)
      await step.runMutation(internal.automations.finishStep, { runId, at: String(i) })
    }
  },
})

/** Starts a run of `automation` now, with its steps as they are. */
export const startRun = async (
  ctx: MutationCtx,
  automation: Doc<"automations">,
  trigger: "manual" | "schedule"
) => {
  const runId = await insertRun(ctx, {
    automationId: automation._id,
    userId: automation.userId,
    name: automation.name,
    trigger,
    steps: automation.steps,
    status: "running",
    startedAt: Date.now(),
    log: [],
  })
  const workflowId = await workflow.start(
    ctx,
    internal.automations.run,
    { runId },
    { onComplete: internal.automations.ended, context: { runId } }
  )
  await ctx.db.patch("automationRuns", runId, { workflowId })
  return runId
}

/** The run's steps as the interpreter needs them: null for a block, or each path's length. */
const shapeOf = internalQuery({
  args: { runId: v.id("automationRuns") },
  returns: v.array(v.union(v.null(), v.array(v.number()))),
  handler: async (ctx, { runId }) =>
    ((await ctx.db.get("automationRuns", runId))?.steps ?? []).map((s) =>
      s.kind === "parallel" ? s.paths.map((p) => p.steps.length) : null
    ),
})

// Reads the run again before writing, so paths running side by side never drop each
// other's entries.
const setLog = async (ctx: MutationCtx, runId: Doc<"automationRuns">["_id"], entry: LogEntry) => {
  const found = await ctx.db.get("automationRuns", runId)
  if (!found) return
  await ctx.db.patch("automationRuns", runId, {
    log: [...found.log.filter((e) => e.at !== entry.at), entry],
  })
}

// What a step's text can name. Only these, filled in as plain text.
const valuesOf = async (ctx: MutationCtx, found: Doc<"automationRuns">) => {
  const settings = await ctx.db
    .query("calendarSettings")
    .withIndex("by_userId", (q) => q.eq("userId", found.userId))
    .unique()
  const zone = settings?.timeZone
  const date = (ms: number, time = false) =>
    new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      weekday: "short",
      month: "short",
      day: "numeric",
      ...(time && { hour: "numeric", minute: "2-digit", timeZoneName: "short" }),
    }).format(ms)
  return { values: { "workflow.name": found.name, "run.date": date(Date.now()) }, date }
}

/** Does one block. Returns what it said or did, and how long to wait after it. */
const doBlock = async (
  ctx: MutationCtx,
  found: Doc<"automationRuns">,
  at: string,
  block: Block
): Promise<{ output: string; waitMs: number }> => {
  const { values, date } = await valuesOf(ctx, found)
  switch (block.kind) {
    case "notify": {
      await ctx.runMutation(components.notifications.lib.notify, {
        owner: found.userId,
        kind: "automation.notify",
        ref: `${found._id}#${at}`,
      })
      return { output: fill(block.message, values), waitMs: 0 }
    }
    case "addNote": {
      const application = await ctx.db.get("applications", block.applicationId)
      if (application?.userId !== found.userId) throw new ConvexError("That application is gone.")
      const text = fill(block.text, {
        ...values,
        "application.company": application.company,
        "application.role": application.role,
        "application.status": application.status,
      })
      await ctx.db.patch("applications", application._id, {
        notes: [...(application.notes ?? []), { text, at: Date.now() }].slice(
          -applicationLimits.notes
        ),
      })
      return {
        output: `Added to ${application.role} at ${application.company}: ${text}`,
        waitMs: 0,
      }
    }
    case "wait": {
      const waitMs = block.minutes * 60_000
      return { output: `Until ${date(Date.now() + waitMs, true)}`, waitMs }
    }
  }
}

/**
 * Runs the block at `at` and records it. A block that can't run is recorded as failed
 * with its reason, which comes back so the interpreter can stop the run.
 */
const runStep = internalMutation({
  args: { runId: v.id("automationRuns"), at: v.string() },
  returns: v.object({ waitMs: v.number(), error: v.optional(v.string()) }),
  handler: async (ctx, { runId, at }) => {
    const found = await ctx.db.get("automationRuns", runId)
    const block = found && stepAt(found.steps, at)
    if (!found || found.status !== "running" || !block || block.kind === "parallel")
      return { waitMs: 0 }
    const startedAt = Date.now()
    try {
      const { output, waitMs } = await doBlock(ctx, found, at, block)
      await setLog(ctx, runId, {
        at,
        kind: block.kind,
        startedAt,
        output,
        ...(waitMs > 0 ? { status: "waiting" } : { status: "done", finishedAt: Date.now() }),
      })
      return { waitMs }
    } catch (cause) {
      if (!(cause instanceof ConvexError)) throw cause
      const error = String(cause.data)
      await setLog(ctx, runId, {
        at,
        kind: block.kind,
        startedAt,
        status: "failed",
        finishedAt: Date.now(),
        error,
      })
      return { waitMs: 0, error }
    }
  },
})

const startSplit = internalMutation({
  args: { runId: v.id("automationRuns"), at: v.string() },
  returns: v.null(),
  handler: async (ctx, { runId, at }) => {
    await setLog(ctx, runId, { at, kind: "parallel", status: "running", startedAt: Date.now() })
    return null
  },
})

/** Marks a wait or a split done. */
const finishStep = internalMutation({
  args: { runId: v.id("automationRuns"), at: v.string() },
  returns: v.null(),
  handler: async (ctx, { runId, at }) => {
    const entry = (await ctx.db.get("automationRuns", runId))?.log.find((e) => e.at === at)
    if (entry) await setLog(ctx, runId, { ...entry, status: "done", finishedAt: Date.now() })
    return null
  },
})

// Called when a run's workflow ends, however it ends.
const ended = internalMutation({
  args: {
    workflowId: vWorkflowId,
    result: vResultValidator,
    context: v.object({ runId: v.id("automationRuns") }),
  },
  returns: v.null(),
  handler: async (ctx, { result, context }) => {
    const found = await ctx.db.get("automationRuns", context.runId)
    if (!found || found.status !== "running") return null
    const finishedAt = Date.now()
    if (result.kind === "success") {
      await patchRun(ctx, found, { status: "done", finishedAt })
      return null
    }
    const failed = found.log.find((e) => e.status === "failed")
    const error =
      result.kind === "canceled" ? "Canceled." : (failed?.error ?? "Something went wrong.")
    // Steps still going when it stopped stop with it.
    const log = found.log.map((e) =>
      e.status === "running" || e.status === "waiting"
        ? { ...e, status: "failed" as const, finishedAt, error }
        : e
    )
    await patchRun(ctx, found, {
      status: result.kind === "failed" ? "failed" : "canceled",
      finishedAt,
      error,
      log,
    })
    return null
  },
})

// The cron's job: start scheduled workflows that are due and set their next time.
const startDue = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const now = Date.now()
    const due = await ctx.db
      .query("automations")
      .withIndex("by_active_and_nextRunAt", (q) => q.eq("active", true).lte("nextRunAt", now))
      .take(50)
    for (const automation of due) {
      if (automation.trigger.kind !== "schedule") continue
      await startRun(ctx, automation, "schedule")
      await ctx.db.patch("automations", automation._id, {
        nextRunAt: nextScheduledAt(now, automation.trigger),
      })
    }
    return due.length
  },
})

/** Stops a run that's still going. */
export const cancelRun = async (ctx: MutationCtx, found: Doc<"automationRuns">) => {
  if (found.status !== "running") return
  // Marked first: canceling calls `ended` straight away, which leaves a stopped run be.
  const finishedAt = Date.now()
  await patchRun(ctx, found, {
    status: "canceled",
    finishedAt,
    error: "Stopped.",
    log: found.log.map((e) =>
      e.status === "running" || e.status === "waiting"
        ? { ...e, status: "failed" as const, finishedAt, error: "Stopped." }
        : e
    ),
  })
  if (found.workflowId) await workflow.cancel(ctx, found.workflowId as WorkflowId)
}

export const engineApi = { run, shapeOf, runStep, startSplit, finishStep, ended, startDue }
