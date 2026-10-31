import type { WorkflowId } from "@convex-dev/workflow"
import { vOnCompleteArgs } from "@convex-dev/workpool"
import { v } from "convex/values"
import { components, internal } from "../../_generated/api"
import { internalMutation, internalQuery } from "../../_generated/server"
import { workLog } from "../../lib/log"
import { fillFromJob } from "../applications/utils"
import { prepareFits } from "../prefilled/utils"
import { descriptionsOf, queriesOf } from "../workflows/fit"
import { readPool, workflow } from "../workflows/manager"
import { apiKeyOf, monthlyCredits, monthOf } from "../workflows/sources"
import { vJudgeResult, vProfile, providerIds } from "../workflows/validators"
import { blankTemplate, type Provider, switchAt } from "./catalog"
import { nextRunAt } from "./schedule"
import { startRun, usageOf, profileFor, addUsage, fillShortlist } from "./utils"
import { vRunPlan, vSavePastedArgs, vFinishRunArgs, vRunEndedArgs } from "./validators"

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

export const profileForLink = internalQuery({
  args: { userId: v.id("users") },
  returns: vProfile,
  handler: async (ctx, { userId }) =>
    (await profileFor(ctx, userId, blankTemplate.answers)).profile,
})

// Plans a run from its loop and the person's Preferences, and picks the sources that
// still have credits this month, in order, for finding new boards.
const beginRun = internalMutation({
  // The run's own workflow, which Jev's judgments wake when they're done.
  args: { runId: v.id("loopRuns"), workflowId: v.string() },
  returns: vRunPlan,
  handler: async (ctx, { runId, workflowId }) => {
    const run = await ctx.db.get("loopRuns", runId)
    const loop = run?.loopId && (await ctx.db.get("loops", run.loopId))
    if (!run || !loop) return null
    const { criteria, profile } = await profileFor(ctx, loop.userId, loop.answers, loop.prompt)
    const month = monthOf(Date.now())
    const sources: Provider[] = []
    for (const provider of providerIds.filter((p) => apiKeyOf(p))) {
      const usage = await usageOf(ctx, provider, month)
      if (!usage?.exhaustedAt && (usage?.used ?? 0) < monthlyCredits(provider) * switchAt)
        sources.push(provider)
    }
    await ctx.db.patch("loopRuns", runId, { status: "running", workflowId })
    return {
      userId: loop.userId,
      profile,
      // Each kind of role they described, in each of their places, and the roles they
      // asked for more of.
      queries: [
        ...queriesOf(criteria, descriptionsOf(loop.prompt)),
        ...profile.liked.slice(0, 2).map((l) => l.split(" at ")[0]),
      ],
      perQuery: 5,
      daily: loop.daily,
      postedToday: loop.answers.postedToday,
      // "Posted since yesterday", with some room for boards that post late.
      ...(loop.answers.postedToday && { since: Date.now() - 36 * 60 * 60 * 1000 }),
      // Remote in Preferences narrows the pick too, so Jev isn't asked about roles that
      // can't pass.
      remoteOnly: criteria.remoteOnly || profile.place === "Remote",
      companies: criteria.listedCompanies ? criteria.companies : [],
      sources,
    }
  },
})

// A lead the person already has for this posting, so checking a link twice opens it.
const leadByUrlKey = internalQuery({
  args: { userId: v.id("users"), urlKey: v.string() },
  returns: v.union(v.null(), v.id("jobLeads")),
  handler: async (ctx, { userId, urlKey }) =>
    (
      await ctx.db
        .query("jobLeads")
        .withIndex("by_userId_and_urlKey", (q) => q.eq("userId", userId).eq("urlKey", urlKey))
        .first()
    )?._id ?? null,
})

// Saves a pasted link's verdict on the shortlist, fit or not: they asked about it.
// A pasted link opens on the shortlist. One checked for an application goes straight to
// it instead: already in the tracker, with the application filled in from the job.
const savePasted = internalMutation({
  args: vSavePastedArgs,
  returns: v.id("jobLeads"),
  handler: async (ctx, { userId, lead, credits, applicationId }) => {
    if (credits) await addUsage(ctx, "firecrawl", credits, false)
    const leadId = await ctx.db.insert("jobLeads", {
      ...lead,
      userId,
      status: applicationId ? "applied" : "new",
      ...(applicationId && { applicationId }),
    })
    if (applicationId) await fillFromJob(ctx, userId, applicationId, lead)
    return leadId
  },
})

// Links a job someone already checked to the application they just added for it.
const attachLead = internalMutation({
  args: { leadId: v.id("jobLeads"), applicationId: v.id("applications") },
  returns: v.null(),
  handler: async (ctx, { leadId, applicationId }) => {
    const lead = await ctx.db.get("jobLeads", leadId)
    if (!lead || lead.applicationId) return null
    await ctx.db.patch("jobLeads", leadId, { applicationId, status: "applied" })
    await fillFromJob(ctx, lead.userId, applicationId, lead)
    return null
  },
})

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

// Saves every role Jev judged with its verdict, records each source's
// credits, and logs the run as one wide event.
const finishRun = internalMutation({
  args: vFinishRunArgs,
  returns: v.null(),
  handler: async (ctx, args) => {
    const run = await ctx.db.get("loopRuns", args.runId)
    if (!run || run.status === "stopped") return null
    const { provider, spent, exhausted } = args
    let fits = 0
    for (const lead of run.candidates ?? []) {
      const seen = await ctx.db
        .query("jobLeads")
        .withIndex("by_userId_and_urlKey", (q) =>
          q.eq("userId", run.userId).eq("urlKey", lead.urlKey)
        )
        .first()
      if (seen) continue
      const fit = lead.verdict === "fit"
      await ctx.db.insert("jobLeads", {
        ...lead,
        userId: run.userId,
        loopId: run.loopId,
        runId: run._id,
        status: fit ? "waiting" : "unfit",
      })
      fits += Number(fit)
    }
    const best = await fillShortlist(ctx, run.userId, run.loopId)
    const shown = best.length
    await prepareFits(ctx, run.userId, best)
    for (const p of providerIds) {
      const credits = spent.filter((s) => s.provider === p).reduce((n, s) => n + s.credits, 0)
      if (credits || exhausted.includes(p)) await addUsage(ctx, p, credits, exhausted.includes(p))
    }
    const failures = run.readFailures ?? 0
    const note =
      args.note ??
      (!run.candidates?.length
        ? "No new roles in the catalog matched this loop's searches."
        : failures
          ? `Jev couldn't judge ${failures} roles.`
          : undefined)
    const credits = spent.reduce((n, s) => n + s.credits, 0)
    await ctx.db.patch("loopRuns", run._id, {
      status: "done",
      provider,
      kept: fits,
      credits,
      finishedAt: Date.now(),
      note,
      readsLeft: undefined,
      readWorkIds: undefined,
      candidates: undefined,
      readFailures: undefined,
    })
    if (shown > 0)
      await ctx.runMutation(components.notifications.lib.notify, {
        owner: run.userId,
        kind: "loop.found",
        ref: run._id,
      })
    const log = workLog("loop.run", { runId: run._id, loopId: run.loopId, userId: run.userId })
    log.set({
      outcome: "done",
      provider,
      judged: run.scanned,
      fits,
      shown,
      failures,
      credits,
      costUsd: run.cost ?? 0,
      spent,
      exhausted,
      note,
      runMs: Date.now() - run.startedAt,
    })
    log.emit()
    return null
  },
})

// Called when a run's workflow ends. A run that finished normally already saved its
// results; this records the ones that failed or were canceled.
const runEnded = internalMutation({
  args: vRunEndedArgs,
  returns: v.null(),
  handler: async (ctx, { workflowId, result, context }) => {
    const run = await ctx.db.get("loopRuns", context.runId)
    if (!run || result.kind === "success" || run.status === "stopped") return null
    const note = result.kind === "failed" ? `Failed: ${result.error}` : "Canceled."
    await ctx.db.patch("loopRuns", run._id, { status: "failed", finishedAt: Date.now(), note })
    const log = workLog("loop.run", { runId: run._id, loopId: run.loopId, userId: run.userId })
    log.set({ outcome: "failed", workflowId, note, runMs: Date.now() - run.startedAt })
    log.setLevel("error")
    log.emit()
    return null
  },
})

export const internalApi = {
  startDue,
  beginRun,
  queueJudging,
  judged,
  finishRun,
  runEnded,
  profileForLink,
  leadByUrlKey,
  savePasted,
  attachLead,
}
