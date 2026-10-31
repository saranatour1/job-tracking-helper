import { v } from "convex/values"
import { components, internal } from "../../_generated/api"
import { internalMutation, internalQuery } from "../../_generated/server"
import { workLog } from "../../lib/log"
import { keepLog } from "../activity/utils"
import { fillFromJob } from "../applications/utils"
import { prepareFits } from "../prefilled/utils"
import { descriptionsOf, queriesOf } from "../workflows/fit"
import { readPool } from "../workflows/manager"
import { apiKeyOf, monthlyCredits, monthOf } from "../workflows/sources"
import { vProfile, providerIds } from "../workflows/validators"
import { blankTemplate, type Provider, switchAt } from "./catalog"
import { nextRunAt } from "./schedule"
import { addUsage, usageOf } from "./usage"
import { startRun, profileFor, fillShortlist } from "./utils"
import { vRunPlan, vSavePastedArgs, vFinishRunArgs, vRunEndedArgs } from "./validators"

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

const beginRun = internalMutation({
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
      queries: [
        ...queriesOf(criteria, descriptionsOf(loop.prompt)),
        ...profile.liked.slice(0, 2).map((l) => l.split(" at ")[0]),
      ],
      perQuery: 5,
      daily: loop.daily,
      postedToday: loop.answers.postedToday,
      ...(loop.answers.postedToday && { since: Date.now() - 36 * 60 * 60 * 1000 }),
      remoteOnly: criteria.remoteOnly || profile.place === "Remote",
      companies: criteria.listedCompanies ? criteria.companies : [],
      sources,
    }
  },
})

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

const queueJudging = internalMutation({
  args: { runId: v.id("loopRuns"), jobIds: v.array(v.id("jobs")), profile: vProfile },
  returns: v.null(),
  handler: async (ctx, { runId, jobIds, profile }) => {
    const readWorkIds = await readPool.enqueueActionBatch(
      ctx,
      internal.api.workflows.judgeOne,
      jobIds.map((jobId) => ({ jobId, profile })),
      { onComplete: internal.api.loops.judged, context: { runId } }
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
    const loop = await ctx.db.get("loops", run.loopId)
    log.set({
      summary: `${loop?.name ?? "A loop"}: Jev judged ${run.scanned} roles, ${fits} fit`,
      ...(failures > 0 && { error: note }),
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
    await keepLog(ctx, log)
    return null
  },
})

const runEnded = internalMutation({
  args: vRunEndedArgs,
  returns: v.null(),
  handler: async (ctx, { workflowId, result, context }) => {
    const run = await ctx.db.get("loopRuns", context.runId)
    if (!run || result.kind === "success" || run.status === "stopped") return null
    const note = result.kind === "failed" ? `Failed: ${result.error}` : "Canceled."
    await ctx.db.patch("loopRuns", run._id, { status: "failed", finishedAt: Date.now(), note })
    const log = workLog("loop.run", { runId: run._id, loopId: run.loopId, userId: run.userId })
    const loop = await ctx.db.get("loops", run.loopId)
    log.set({
      summary: `${loop?.name ?? "A loop"} stopped`,
      error: note,
      outcome: "failed",
      workflowId,
      note,
      runMs: Date.now() - run.startedAt,
    })
    log.setLevel("error")
    await keepLog(ctx, log)
    return null
  },
})

export const internalApi = {
  startDue,
  beginRun,
  queueJudging,
  finishRun,
  runEnded,
  profileForLink,
  leadByUrlKey,
  savePasted,
  attachLead,
}
