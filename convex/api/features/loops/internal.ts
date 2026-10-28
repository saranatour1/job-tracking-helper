import { vResultValidator, vWorkflowId, type WorkflowId } from "@convex-dev/workflow"
import { vOnCompleteArgs, type WorkId } from "@convex-dev/workpool"
import { v } from "convex/values"
import { internal } from "../../../_generated/api"
import type { Doc, Id } from "../../../_generated/dataModel"
import { internalMutation, type MutationCtx } from "../../../_generated/server"
import { workLog } from "../../../lib/log"
import { rowLimits } from "../preferences/rows"
import { criteriaOf, queriesOf } from "../workflows/fit"
import { readPool, workflow } from "../workflows/manager"
import { apiKeyOf, monthlyCredits, monthOf } from "../workflows/sources"
import { vJudgeResult, vProfile, vProvider, vSpent } from "../workflows/validators"
import { type Provider, switchAt } from "./catalog"
import { nextRunAt } from "./schedule"
import { providerIds } from "./validators"

// Starts one run of a loop: a queued row for the Runs tab, then the workflow.
export const startRun = async (ctx: MutationCtx, loop: Doc<"loops">) => {
  const runId = await ctx.db.insert("loopRuns", {
    loopId: loop._id,
    userId: loop.userId,
    loopName: loop.name,
    status: "queued",
    scanned: 0,
    kept: 0,
    saved: 0,
    applied: 0,
    credits: 0,
    startedAt: Date.now(),
  })
  const workflowId = await workflow.start(
    ctx,
    internal.workflows.findJobs,
    { runId },
    { onComplete: internal.loops.runEnded, context: { runId } }
  )
  await ctx.db.patch("loopRuns", runId, { workflowId })
  return runId
}

// The cron's job, every 15 minutes: start loops that are due, a batch at a time, and
// move each one's next run to tomorrow morning.
const startDue = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const now = Date.now()
    const due = await ctx.db
      .query("loops")
      .withIndex("by_active_and_nextRunAt", (q) => q.eq("active", true).lte("nextRunAt", now))
      .take(25)
    for (const loop of due) {
      await startRun(ctx, loop)
      await ctx.db.patch("loops", loop._id, { nextRunAt: nextRunAt(now, loop.at, loop.timeZone) })
    }
    return due.length
  },
})

const usageOf = (ctx: MutationCtx, provider: Provider, month: string) =>
  ctx.db
    .query("sourceUsage")
    .withIndex("by_provider_and_month", (q) => q.eq("provider", provider).eq("month", month))
    .unique()

// Plans a run from its loop and the person's Preferences, and picks the sources that
// still have credits this month, in order, for finding new boards.
const beginRun = internalMutation({
  args: { runId: v.id("loopRuns") },
  returns: v.union(
    v.null(),
    v.object({
      userId: v.id("users"),
      profile: vProfile,
      queries: v.array(v.string()),
      perQuery: v.number(),
      daily: v.number(),
      postedToday: v.boolean(),
      since: v.optional(v.number()),
      companies: v.array(v.string()),
      sources: v.array(vProvider),
    })
  ),
  handler: async (ctx, { runId }) => {
    const run = await ctx.db.get("loopRuns", runId)
    const loop = run && (await ctx.db.get("loops", run.loopId))
    if (!run || !loop) return null
    const tags = await ctx.db
      .query("preferenceTags")
      .withIndex("by_userId_and_kind_and_order", (q) => q.eq("userId", loop.userId))
      .take(rowLimits.tags)
    const criteria = criteriaOf(loop.answers, tags)
    const month = monthOf(Date.now())
    const sources: Provider[] = []
    for (const provider of providerIds.filter((p) => apiKeyOf(p))) {
      const usage = await usageOf(ctx, provider, month)
      if (!usage?.exhaustedAt && (usage?.used ?? 0) < monthlyCredits(provider) * switchAt)
        sources.push(provider)
    }
    await ctx.db.patch("loopRuns", runId, { status: "running" })
    return {
      userId: loop.userId,
      profile: { ...criteria, ...(loop.prompt && { prompt: loop.prompt }) },
      // The person's own words search the catalog too.
      queries: [...queriesOf(criteria), ...(loop.prompt ? [loop.prompt] : [])],
      perQuery: 10,
      daily: loop.daily,
      postedToday: loop.answers.postedToday,
      // "Posted since yesterday", with some room for boards that post late.
      ...(loop.answers.postedToday && { since: Date.now() - 36 * 60 * 60 * 1000 }),
      companies: criteria.listedCompanies ? criteria.companies : [],
      sources,
    }
  },
})

const addUsage = async (
  ctx: MutationCtx,
  provider: Provider,
  credits: number,
  exhausted: boolean
) => {
  const month = monthOf(Date.now())
  const usage = await usageOf(ctx, provider, month)
  const exhaustedAt = exhausted ? Date.now() : usage?.exhaustedAt
  if (usage)
    await ctx.db.patch("sourceUsage", usage._id, { used: usage.used + credits, exhaustedAt })
  else
    await ctx.db.insert("sourceUsage", {
      provider,
      month,
      used: credits,
      ...(exhaustedAt && { exhaustedAt }),
    })
}

// Hands a run's roles to the batch worker as one batch for Jev to judge. Each
// judgment reports to judged.
const queueJudging = internalMutation({
  args: { runId: v.id("loopRuns"), jobIds: v.array(v.id("jobs")), profile: vProfile },
  returns: v.null(),
  handler: async (ctx, { runId, jobIds, profile }) => {
    const readWorkIds = await readPool.enqueueActionBatch(
      ctx,
      internal.workflows.judgeOne,
      jobIds.map((jobId) => ({ jobId, profile })),
      { onComplete: internal.loops.judged, context: { runId } }
    )
    await ctx.db.patch("loopRuns", runId, {
      readsLeft: jobIds.length,
      readWorkIds,
      candidates: [],
      cost: 0,
      readFailures: 0,
    })
    return null
  },
})

// Adds one judgment to its run's tally, and wakes the run after the last one.
const judged = internalMutation({
  args: vOnCompleteArgs(v.object({ runId: v.id("loopRuns") }), vJudgeResult),
  returns: v.null(),
  handler: async (ctx, { context, result }) => {
    const run = await ctx.db.get("loopRuns", context.runId)
    if (!run?.readsLeft) return null
    const done = result.kind === "success" ? result.returnValue : undefined
    const readsLeft = run.readsLeft - 1
    await ctx.db.patch("loopRuns", run._id, {
      readsLeft,
      scanned: run.scanned + Number(Boolean(done?.judged)),
      cost: (run.cost ?? 0) + (done?.cost ?? 0),
      readFailures: (run.readFailures ?? 0) + Number(!done),
      candidates: done?.judged ? [...(run.candidates ?? []), done.judged] : run.candidates,
    })
    if (readsLeft === 0 && run.workflowId)
      await workflow.sendEvent(ctx, {
        workflowId: run.workflowId as WorkflowId,
        name: "judged",
      })
    return null
  },
})

// Saves every role Jev judged with its verdict, fits first, records each source's
// credits, and logs the run as one wide event.
const finishRun = internalMutation({
  args: {
    runId: v.id("loopRuns"),
    provider: v.optional(vProvider),
    spent: v.array(vSpent),
    exhausted: v.array(vProvider),
    note: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const run = await ctx.db.get("loopRuns", args.runId)
    if (!run || run.status === "stopped") return null
    const { provider, spent, exhausted } = args
    const judgedRoles = [...(run.candidates ?? [])].sort((a, b) => b.fit - a.fit)
    let saved = 0
    for (const lead of judgedRoles) {
      const seen = await ctx.db
        .query("jobLeads")
        .withIndex("by_userId_and_urlKey", (q) =>
          q.eq("userId", run.userId).eq("urlKey", lead.urlKey)
        )
        .first()
      if (seen) continue
      const fits = lead.verdict === "fit"
      await ctx.db.insert("jobLeads", {
        ...lead,
        userId: run.userId,
        loopId: run.loopId,
        runId: run._id,
        status: fits ? "new" : "unfit",
      })
      saved += Number(fits)
    }
    for (const p of providerIds) {
      const credits = spent.filter((s) => s.provider === p).reduce((n, s) => n + s.credits, 0)
      if (credits || exhausted.includes(p)) await addUsage(ctx, p, credits, exhausted.includes(p))
    }
    const failures = run.readFailures ?? 0
    const note =
      args.note ??
      (!judgedRoles.length
        ? "No new roles in the catalog matched this loop's searches."
        : failures
          ? `Jev couldn't judge ${failures} roles.`
          : undefined)
    const credits = spent.reduce((n, s) => n + s.credits, 0)
    await ctx.db.patch("loopRuns", run._id, {
      status: "done",
      provider,
      kept: saved,
      credits,
      finishedAt: Date.now(),
      note,
      readsLeft: undefined,
      readWorkIds: undefined,
      candidates: undefined,
      readFailures: undefined,
    })
    const log = workLog("loop.run", { runId: run._id, loopId: run.loopId, userId: run.userId })
    log.set({
      outcome: "done",
      provider,
      judged: run.scanned,
      fits: saved,
      failures,
      credits,
      costUsd: run.cost ?? 0,
      spent,
      exhausted,
      note,
      durationMs: Date.now() - run.startedAt,
    })
    log.emit()
    return null
  },
})

// Called when a run's workflow ends. A run that finished normally already saved its
// results; this records the ones that failed or were canceled.
const runEnded = internalMutation({
  args: {
    workflowId: vWorkflowId,
    result: vResultValidator,
    context: v.object({ runId: v.id("loopRuns") }),
  },
  returns: v.null(),
  handler: async (ctx, { workflowId, result, context }) => {
    const run = await ctx.db.get("loopRuns", context.runId)
    if (!run || result.kind === "success" || run.status === "stopped") return null
    const note = result.kind === "failed" ? `Failed: ${result.error}` : "Canceled."
    await ctx.db.patch("loopRuns", run._id, { status: "failed", finishedAt: Date.now(), note })
    const log = workLog("loop.run", { runId: run._id, loopId: run.loopId, userId: run.userId })
    log.set({ outcome: "failed", workflowId, note, durationMs: Date.now() - run.startedAt })
    log.setLevel("error")
    log.emit()
    return null
  },
})

// Stops a run in progress: cancels its workflow and the judgments not started yet.
// ponytail: the search's credits live in the canceled workflow, so a stopped run
// under-counts by those few.
export const stopRunNow = async (ctx: MutationCtx, run: Doc<"loopRuns">) => {
  if (run.workflowId) await workflow.cancel(ctx, run.workflowId as WorkflowId)
  for (const id of run.readWorkIds ?? []) await readPool.cancel(ctx, id as WorkId)
  await ctx.db.patch("loopRuns", run._id, {
    status: "stopped",
    finishedAt: Date.now(),
    note: `Stopped after Jev judged ${run.scanned} roles. Nothing was saved.`,
    readsLeft: undefined,
    readWorkIds: undefined,
    candidates: undefined,
    readFailures: undefined,
  })
  const log = workLog("loop.run", { runId: run._id, loopId: run.loopId, userId: run.userId })
  log.set({ outcome: "stopped", scanned: run.scanned, durationMs: Date.now() - run.startedAt })
  log.emit()
}

// Everything Loops stored for a user, for deleting an account. Usage is shared, so it stays.
export const deleteLoops = async (ctx: MutationCtx, userId: Id<"users">) => {
  for await (const loop of ctx.db
    .query("loops")
    .withIndex("by_userId", (q) => q.eq("userId", userId)))
    await ctx.db.delete("loops", loop._id)
  for await (const run of ctx.db
    .query("loopRuns")
    .withIndex("by_userId_and_startedAt", (q) => q.eq("userId", userId)))
    await ctx.db.delete("loopRuns", run._id)
  for await (const lead of ctx.db
    .query("jobLeads")
    .withIndex("by_userId_and_status", (q) => q.eq("userId", userId)))
    await ctx.db.delete("jobLeads", lead._id)
}

export const internalApi = { startDue, beginRun, queueJudging, judged, finishRun, runEnded }
