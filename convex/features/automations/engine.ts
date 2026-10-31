import { vResultValidator, vWorkflowId } from "@convex-dev/workflow"
import { ConvexError, v } from "convex/values"
import { internal } from "../../_generated/api"
import { internalMutation, internalQuery } from "../../_generated/server"
import { limits as rates, workflow } from "../workflows/manager"
import { patchRun, recordChoice } from "./counts"
import {
  vAutomationEvent,
  fill,
  isBranch,
  limits,
  nextScheduledAt,
  stepAt,
  vRunPathArgs,
  vRunShape,
  vStepOutcome,
  vStartBranchArgs,
  vDecision,
  vAnsweredArgs,
  vFoundRolesArgs,
  vEmailToSend,
} from "./validators"
import { runBlock, startRun, setLog, factsOf, doBlock, matches } from "./utils"

// One interpreter runs every workflow anyone builds. It walks the run's copy of the
// steps: a block is one mutation; a split starts each path as its own child workflow and
// goes on once every path is done; Ask Jev asks, then runs the one path Jev picked. A
// step that can't run records why, and the run stops there.
const run = workflow.define({
  args: { runId: v.id("automationRuns") },
  handler: async (step, { runId }): Promise<void> => {
    const shape = await step.runQuery(internal.automations.shapeOf, { runId })
    for (const [i, branch] of shape.entries()) {
      const at = String(i)
      if (branch === null) {
        const done = await runBlock(step, runId, at)
        if (done === "stop") return
        if (done !== "next") throw new Error(done.error)
        continue
      }
      await step.runMutation(internal.automations.startBranch, { runId, at, kind: branch.kind })
      if (branch.kind === "decide") {
        const { path, error } = await step.runAction(internal.automations.askJev, { runId, at })
        if (error || path === null) throw new Error(error ?? "Jev didn't answer.")
        for (let j = 0; j < (branch.lengths[path] ?? 0); j++) {
          const done = await runBlock(step, runId, `${i}.${path}.${j}`)
          if (done === "stop") {
            await step.runMutation(internal.automations.finishStep, { runId, at })
            return
          }
          if (done !== "next") throw new Error(done.error)
        }
      } else {
        // Each path has its own journal, so a wait on one never holds back the others (in
        // one workflow, steps started together advance together). A path that fails stops
        // there and says why; the others still finish first.
        const errors = await Promise.all(
          branch.lengths.map((length, path) =>
            step.runWorkflow(internal.automations.runPath, { runId, split: i, path, length })
          )
        )
        const error = errors.find((e) => e !== null)
        if (error) throw new Error(error)
      }
      await step.runMutation(internal.automations.finishStep, { runId, at })
    }
  },
})

/** One path of a split: its blocks in order. Returns why it stopped early, or null. */
const runPath = workflow.define({
  args: vRunPathArgs,
  returns: v.union(v.string(), v.null()),
  handler: async (step, { runId, split, path, length }): Promise<string | null> => {
    for (let j = 0; j < length; j++) {
      const done = await runBlock(step, runId, `${split}.${path}.${j}`)
      if (done === "stop") return null
      if (done !== "next") return done.error
    }
    return null
  },
})

/** The run's steps as the interpreter needs them: null for a block, or a branch's kind
 * and each path's length. */
const shapeOf = internalQuery({
  args: { runId: v.id("automationRuns") },
  returns: vRunShape,
  handler: async (ctx, { runId }) =>
    ((await ctx.db.get("automationRuns", runId))?.steps ?? []).map((s) =>
      isBranch(s) ? { kind: s.kind, lengths: s.paths.map((p) => p.steps.length) } : null
    ),
})

/**
 * Runs the block at `at` and records it. A block that can't run is recorded as failed
 * with its reason, which comes back so the interpreter can stop the run.
 */
const runStep = internalMutation({
  args: { runId: v.id("automationRuns"), at: v.string() },
  returns: vStepOutcome,
  handler: async (ctx, { runId, at }) => {
    const found = await ctx.db.get("automationRuns", runId)
    const block = found && stepAt(found.steps, at)
    if (!found || found.status !== "running" || !block || isBranch(block)) return { waitMs: 0 }
    const startedAt = Date.now()
    try {
      const { output, waitMs, email, loopRunId, stop } = await doBlock(ctx, found, at, block)
      await setLog(ctx, runId, {
        at,
        kind: block.kind,
        startedAt,
        output,
        ...(waitMs > 0
          ? { status: "waiting" }
          : email || loopRunId
            ? { status: "running" }
            : { status: "done", finishedAt: Date.now() }),
      })
      return {
        waitMs,
        ...(email && { email }),
        ...(loopRunId && { loopRunId }),
        ...(stop && { stop }),
      }
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

const startBranch = internalMutation({
  args: vStartBranchArgs,
  returns: v.null(),
  handler: async (ctx, { runId, at, kind }) => {
    await setLog(ctx, runId, { at, kind, status: "running", startedAt: Date.now() })
    return null
  },
})

/** Marks a wait, an email or a branch done. */
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
  // Inline: the page imports validators.ts, and this package is server-only.
  args: {
    workflowId: vWorkflowId,
    result: vResultValidator,
    context: v.object({ runId: v.id("automationRuns") }),
  },
  returns: v.null(),
  handler: async (ctx, { workflowId, result, context }) => {
    // The run keeps its own history, so the workflow's journal can go once it's over.
    await ctx.scheduler.runAfter(0, internal.automations.forgetWorkflow, { workflowId })
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

/** What Ask Jev needs: the question, the answers, and the facts the run knows. */
const decisionOf = internalQuery({
  args: { runId: v.id("automationRuns"), at: v.string() },
  returns: vDecision,
  handler: async (ctx, { runId, at }) => {
    const found = await ctx.db.get("automationRuns", runId)
    const step = found && stepAt(found.steps, at)
    if (!found || found.status !== "running" || step?.kind !== "decide") return null
    const { values } = await factsOf(ctx, found)
    return {
      question: step.question,
      answers: step.paths.map((p) => p.label),
      facts: values,
    }
  },
})

/** Records Jev's answer, or why there wasn't one, and counts it. */
const answered = internalMutation({
  args: vAnsweredArgs,
  returns: v.null(),
  handler: async (ctx, { runId, at, choice, error }) => {
    const found = await ctx.db.get("automationRuns", runId)
    const entry = found?.log.find((e) => e.at === at)
    if (!found || !entry) return null
    if (error) {
      await setLog(ctx, runId, { ...entry, status: "failed", finishedAt: Date.now(), error })
      return null
    }
    await setLog(ctx, runId, { ...entry, choice, output: `Jev answered “${choice}”` })
    if (choice) await recordChoice(ctx, found, at, choice)
    return null
  },
})

/** Records how a Find roles step's loop run went. Returns why it failed, or null. */
const foundRoles = internalMutation({
  args: vFoundRolesArgs,
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, { runId, at, loopRunId, error }) => {
    const entry = (await ctx.db.get("automationRuns", runId))?.log.find((e) => e.at === at)
    const loopRun = await ctx.db.get("loopRuns", loopRunId)
    const failed =
      error !== undefined
        ? `The search failed: ${error}`.slice(0, 300)
        : loopRun?.status !== "done"
          ? "The loop is gone, so there was nothing to search."
          : null
    // A run that ended early on the workflow's side ends on the loop's side too.
    if (failed && loopRun && (loopRun.status === "queued" || loopRun.status === "running"))
      await ctx.db.patch("loopRuns", loopRunId, {
        status: "failed",
        finishedAt: Date.now(),
        note: failed,
      })
    if (!entry) return failed
    await setLog(ctx, runId, {
      ...entry,
      finishedAt: Date.now(),
      ...(failed
        ? { status: "failed", error: failed }
        : {
            status: "done",
            output: `Jev judged ${loopRun!.scanned} roles: ${loopRun!.kept} fit.${
              loopRun!.note ? ` ${loopRun!.note}` : ""
            }`,
          }),
    })
    return failed
  },
})

/** What an email step says, and who it goes to: you, for Notify me, or whoever Send
 * email names. */
const emailOf = internalQuery({
  args: { runId: v.id("automationRuns"), at: v.string() },
  returns: vEmailToSend,
  handler: async (ctx, { runId, at }) => {
    const found = await ctx.db.get("automationRuns", runId)
    const entry = found?.log.find((e) => e.at === at)
    const block = found && stepAt(found.steps, at)
    if (!found || found.status !== "running" || !entry?.output) return null
    if (block?.kind !== "sendEmail")
      return { userId: found.userId, subject: found.name, text: entry.output }
    const { values } = await factsOf(ctx, found)
    const id = found.context?.applicationId
    const application = id && (await ctx.db.get("applications", id))
    return {
      userId: found.userId,
      ...(application &&
        application.trashedAt === undefined && {
          application: { id: application._id, company: application.company },
        }),
      to: fill(block.to, values).trim(),
      subject: fill(block.subject, values).slice(0, limits.subject),
      text: fill(block.text, values),
    }
  },
})

/** Marks an email step done, or failed with the reason. */
const emailed = internalMutation({
  args: { runId: v.id("automationRuns"), at: v.string(), error: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, { runId, at, error }) => {
    const entry = (await ctx.db.get("automationRuns", runId))?.log.find((e) => e.at === at)
    if (!entry) return null
    await setLog(ctx, runId, {
      ...entry,
      status: error ? "failed" : "done",
      finishedAt: Date.now(),
      ...(error
        ? { error }
        : entry.kind === "notify" && { output: `${entry.output} (also emailed)` }),
    })
    return null
  },
})

/** Starts the person's workflows an event matches, with what the event was about. */
const onEvent = internalMutation({
  args: { userId: v.id("users"), event: vAutomationEvent },
  returns: v.number(),
  handler: async (ctx, { userId, event }) => {
    const automations = await ctx.db
      .query("automations")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .take(limits.automations)
    let started = 0
    for (const automation of automations) {
      if (!automation.active || !matches(automation.trigger, event)) continue
      // A flood of mail can't start runs without end.
      const { ok } = await rates.limit(ctx, "automationEvent", { key: userId })
      if (!ok) break
      const { kind: _kind, ...rest } = event
      await startRun(ctx, automation, "event", {
        ...("applicationId" in rest && rest.applicationId && { applicationId: rest.applicationId }),
        ...("mailEventId" in rest && { mailEventId: rest.mailEventId }),
        ...("bookingId" in rest && { bookingId: rest.bookingId }),
        ...("from" in rest && { from: rest.from, to: rest.to }),
        ...("goalId" in rest && { goalId: rest.goalId }),
      })
      started++
    }
    return started
  },
})

const forgetWorkflow = internalMutation({
  args: { workflowId: vWorkflowId },
  returns: v.null(),
  handler: async (ctx, { workflowId }) => {
    await workflow.cleanup(ctx, workflowId)
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
      // The lower bound matters: a missing nextRunAt (every manual workflow) sorts before
      // all numbers, so without it they'd fill the batch and starve the scheduled ones.
      .withIndex("by_active_and_nextRunAt", (q) =>
        q.eq("active", true).gte("nextRunAt", 0).lte("nextRunAt", now)
      )
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

/** The person's first loop, for a drafted Find roles step. */
const firstLoopOf = internalQuery({
  args: { userId: v.id("users") },
  returns: v.union(v.id("loops"), v.null()),
  handler: async (ctx, { userId }) =>
    (
      await ctx.db
        .query("loops")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .first()
    )?._id ?? null,
})

export const engineApi = {
  firstLoopOf,
  run,
  runPath,
  decisionOf,
  answered,
  foundRoles,
  emailOf,
  emailed,
  onEvent,
  startBranch,
  forgetWorkflow,
  shapeOf,
  runStep,
  finishStep,
  ended,
  startDue,
}
