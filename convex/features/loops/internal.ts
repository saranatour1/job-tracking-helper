import { vResultValidator, vWorkflowId, type WorkflowId } from "@convex-dev/workflow"
import { vOnCompleteArgs, type WorkId } from "@convex-dev/workpool"
import { v } from "convex/values"
import { components, internal } from "../../_generated/api"
import type { Doc, Id } from "../../_generated/dataModel"
import {
  internalMutation,
  internalQuery,
  type MutationCtx,
  type QueryCtx,
} from "../../_generated/server"
import { workLog } from "../../lib/log"
import { fillFromJob } from "../applications/public"
import { rowLimits } from "../preferences/rows"
import { criteriaOf, descriptionsOf, queriesOf } from "../workflows/fit"
import { profileOf } from "../workflows/judge"
import { readPool, workflow } from "../workflows/manager"
import { apiKeyOf, monthlyCredits, monthOf } from "../workflows/sources"
import { vJudgeResult, vPasted, vProfile, vProvider, vSpent } from "../workflows/validators"
import { blankTemplate, defaultShow, type LoopAnswers, type Provider, switchAt } from "./catalog"
import { nextRunAt } from "./schedule"
import { providerIds } from "./validators"

// A queued run of a loop, for the Runs tab. A workflow's Find roles step runs it as part
// of its own run; otherwise `startRun` starts it.
export const insertLoopRun = (ctx: MutationCtx, loop: Doc<"loops">) =>
  ctx.db.insert("loopRuns", {
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

// Starts one run of a loop: a queued row, then the workflow.
export const startRun = async (ctx: MutationCtx, loop: Doc<"loops">) => {
  const runId = await insertLoopRun(ctx, loop)
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

// What Jev judges roles against for this person: the loop's answers and words, their
// Preferences, and the last roles they rated. Pasted links use it with the defaults.
const profileFor = async (
  ctx: QueryCtx,
  userId: Id<"users">,
  answers: LoopAnswers,
  prompt?: string
) => {
  const tags = await ctx.db
    .query("preferenceTags")
    .withIndex("by_userId_and_kind_and_order", (q) => q.eq("userId", userId))
    .take(rowLimits.tags)
  const settings = await ctx.db
    .query("preferences")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .unique()
  const written = await ctx.db
    .query("profileEntries")
    .withIndex("by_userId_and_kind_and_order", (q) => q.eq("userId", userId).eq("kind", "answer"))
    .take(rowLimits.answer)
  const answer = (key: string) => written.find((e) => e.key === key)?.value.trim()
  const rated = async (feedback: "more" | "less") =>
    (
      await ctx.db
        .query("jobLeads")
        .withIndex("by_userId_and_feedback", (q) => q.eq("userId", userId).eq("feedback", feedback))
        .order("desc")
        .take(8)
    ).map((l) => `${l.title} at ${l.company}`)
  const criteria = criteriaOf(answers, tags)
  return {
    criteria,
    profile: profileOf(criteria, {
      prompt,
      workMode: settings?.workMode ?? "any",
      pay: answer("pay"),
      visa: answer("visa"),
      liked: await rated("more"),
      disliked: await rated("less"),
    }),
  }
}

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
      remoteOnly: v.boolean(),
      companies: v.array(v.string()),
      sources: v.array(vProvider),
    })
  ),
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

export const addUsage = async (
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
  args: {
    userId: v.id("users"),
    lead: vPasted,
    credits: v.number(),
    applicationId: v.optional(v.id("applications")),
  },
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
    const shown = await fillShortlist(ctx, run.userId, run.loopId)
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

// Puts a loop's best waiting fits on the shortlist, as many as the person has room for:
// the loop's size, less the roles from it still on their shortlist. Returns how many.
// ponytail: a waiting role can close on its board before it's shown; the sheet still
// opens it, and the link says so.
const fillShortlist = async (ctx: MutationCtx, userId: Id<"users">, loopId: Id<"loops">) => {
  const loop = await ctx.db.get("loops", loopId)
  const of = async (status: "new" | "waiting") =>
    (
      await ctx.db
        .query("jobLeads")
        .withIndex("by_userId_and_status", (q) => q.eq("userId", userId).eq("status", status))
        .take(300)
    ).filter((l) => l.loopId === loopId)
  const room = Math.max(0, (loop?.show ?? defaultShow) - (await of("new")).length)
  const best = (await of("waiting")).sort((a, b) => b.fit - a.fit).slice(0, room)
  for (const lead of best) await ctx.db.patch("jobLeads", lead._id, { status: "new" })
  return best.length
}

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
    log.set({ outcome: "failed", workflowId, note, runMs: Date.now() - run.startedAt })
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
  log.set({ outcome: "stopped", scanned: run.scanned, runMs: Date.now() - run.startedAt })
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
