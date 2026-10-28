import { vResultValidator, vWorkflowId } from "@convex-dev/workflow"
import { v } from "convex/values"
import { internal } from "../../../_generated/api"
import type { Doc, Id } from "../../../_generated/dataModel"
import { internalMutation, internalQuery, type MutationCtx } from "../../../_generated/server"
import { workLog } from "../../../lib/log"
import { rowLimits } from "../preferences/rows"
import { criteriaOf, queriesOf, urlKey } from "../workflows/fit"
import { workflow } from "../workflows/manager"
import { apiKeyOf, monthlyCredits, monthOf } from "../workflows/sources"
import { vCriteria, vKept, vPosting, vProvider, vSpent } from "../workflows/validators"
import { type Provider, scannedPerRun, switchAt } from "./catalog"
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
// still have credits this month, in order.
const beginRun = internalMutation({
  args: { runId: v.id("loopRuns") },
  returns: v.union(
    v.null(),
    v.object({
      userId: v.id("users"),
      criteria: vCriteria,
      queries: v.array(v.string()),
      perQuery: v.number(),
      scan: v.number(),
      daily: v.number(),
      postedToday: v.boolean(),
      sources: v.array(vProvider),
      why: v.string(),
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
    const configured = providerIds.filter((p) => apiKeyOf(p))
    const sources: Provider[] = []
    for (const provider of configured) {
      const usage = await usageOf(ctx, provider, month)
      if (!usage?.exhaustedAt && (usage?.used ?? 0) < monthlyCredits(provider) * switchAt)
        sources.push(provider)
    }
    await ctx.db.patch("loopRuns", runId, { status: "running" })
    const queries = queriesOf(criteria)
    const scan = scannedPerRun(loop.daily)
    return {
      userId: loop.userId,
      criteria,
      queries,
      // A few extra results per search, since some will be postings already seen.
      perQuery: Math.min(20, Math.ceil(scan / queries.length) + 5),
      scan,
      daily: loop.daily,
      postedToday: loop.answers.postedToday,
      sources,
      why: configured.length
        ? "Every source is out of credits this month."
        : "No source is set up yet. Add FIRECRAWL_API_KEY or CONTEXT_DEV_API_KEY to the Convex env.",
    }
  },
})

// Drops postings the person has already seen, keeping up to `limit`.
const unseen = internalQuery({
  args: { userId: v.id("users"), postings: v.array(vPosting), limit: v.number() },
  returns: v.array(vPosting),
  handler: async (ctx, { userId, postings, limit }) => {
    const fresh = []
    for (const posting of postings) {
      if (fresh.length >= limit) break
      const seen = await ctx.db
        .query("jobLeads")
        .withIndex("by_userId_and_urlKey", (q) =>
          q.eq("userId", userId).eq("urlKey", urlKey(posting.url))
        )
        .first()
      if (!seen) fresh.push(posting)
    }
    return fresh
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

// Saves what a run kept, records each source's credits, and logs the run as one wide
// event.
const finishRun = internalMutation({
  args: {
    runId: v.id("loopRuns"),
    provider: v.optional(vProvider),
    scanned: v.number(),
    kept: v.array(vKept),
    spent: v.array(vSpent),
    exhausted: v.array(vProvider),
    note: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, { runId, provider, scanned, kept, spent, exhausted, note }) => {
    const run = await ctx.db.get("loopRuns", runId)
    if (!run) return null
    let saved = 0
    for (const lead of kept) {
      const seen = await ctx.db
        .query("jobLeads")
        .withIndex("by_userId_and_urlKey", (q) =>
          q.eq("userId", run.userId).eq("urlKey", lead.urlKey)
        )
        .first()
      if (seen) continue
      await ctx.db.insert("jobLeads", {
        ...lead,
        userId: run.userId,
        loopId: run.loopId,
        runId,
        status: "new",
      })
      saved++
    }
    for (const p of providerIds) {
      const credits = spent.filter((s) => s.provider === p).reduce((n, s) => n + s.credits, 0)
      if (credits || exhausted.includes(p)) await addUsage(ctx, p, credits, exhausted.includes(p))
    }
    const credits = spent.reduce((n, s) => n + s.credits, 0)
    const status = provider ? "done" : "skipped"
    await ctx.db.patch("loopRuns", runId, {
      status,
      provider,
      scanned,
      kept: saved,
      credits,
      finishedAt: Date.now(),
      note,
    })
    const log = workLog("loop.run", { runId, loopId: run.loopId, userId: run.userId })
    log.set({
      outcome: status,
      provider,
      scanned,
      kept: saved,
      credits,
      spent,
      exhausted,
      note,
      durationMs: Date.now() - run.startedAt,
    })
    if (status === "skipped") log.setLevel("warn")
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
    if (!run || result.kind === "success") return null
    const note = result.kind === "failed" ? `Failed: ${result.error}` : "Canceled."
    await ctx.db.patch("loopRuns", run._id, { status: "failed", finishedAt: Date.now(), note })
    const log = workLog("loop.run", { runId: run._id, loopId: run.loopId, userId: run.userId })
    log.set({ outcome: "failed", workflowId, note, durationMs: Date.now() - run.startedAt })
    log.setLevel("error")
    log.emit()
    return null
  },
})

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

export const internalApi = { startDue, beginRun, unseen, finishRun, runEnded }
