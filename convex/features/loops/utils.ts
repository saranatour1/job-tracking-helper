import type { MutationCtx, QueryCtx } from "../../_generated/server"
import type { Id, Doc } from "../../_generated/dataModel"
import { ConvexError } from "convex/values"
import { NewLoop } from "./validators"
import { isTimeZone, nextRunAt } from "./schedule"
import { workflow, readPool } from "../workflows/manager"
import { internal } from "../../_generated/api"
import { type LoopAnswers, defaultShow } from "./catalog"
import { rowLimits } from "../preferences/rows"
import { criteriaOf } from "../workflows/fit"
import { profileOf } from "../workflows/judge"
import type { WorkflowId } from "@convex-dev/workflow"
import type { WorkId } from "@convex-dev/workpool"
import { workLog } from "../../lib/log"
import { keepLog } from "../activity/utils"
import { limits } from "../workflows/manager"
import { maxLoops } from "./catalog"

export const ownLoop = async (ctx: MutationCtx, userId: Id<"users">, loopId: Id<"loops">) => {
  const loop = await ctx.db.get("loops", loopId)
  if (!loop || loop.userId !== userId) throw new ConvexError("That loop doesn't exist.")
  return loop
}

export const rowOf = (loop: typeof NewLoop.infer) => {
  if (loop.answers.remoteOnly && loop.answers.nearMe)
    throw new ConvexError("Pick remote only or on-site near you, not both.")
  if (!isTimeZone(loop.timeZone)) throw new ConvexError("That time zone isn't one we know.")
  const { auto, prompt, ...fields } = loop
  return {
    ...fields,
    prompt: prompt || undefined,
    active: auto,
    nextRunAt: nextRunAt(Date.now(), loop.at, loop.timeZone),
  }
}

export const createLoop = async (
  ctx: MutationCtx,
  userId: Id<"users">,
  loop: typeof NewLoop.infer
) => {
  const count = (
    await ctx.db
      .query("loops")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .take(maxLoops)
  ).length
  if (count >= maxLoops)
    throw new ConvexError(`You can have ${maxLoops} loops. Remove one to start another.`)
  return ctx.db.insert("loops", { ...rowOf(loop), userId })
}

export const lastRunOf = (ctx: QueryCtx, loopId: Id<"loops">) =>
  ctx.db
    .query("loopRuns")
    .withIndex("by_loopId_and_startedAt", (q) => q.eq("loopId", loopId))
    .order("desc")
    .first()

export const ownLead = async (ctx: MutationCtx, userId: Id<"users">, leadId: Id<"jobLeads">) => {
  const lead = await ctx.db.get("jobLeads", leadId)
  if (!lead || lead.userId !== userId) throw new ConvexError("That job doesn't exist.")
  return lead
}

export const countOnRun = async (
  ctx: MutationCtx,
  runId: Id<"loopRuns"> | undefined,
  field: "saved" | "applied"
) => {
  const run = runId && (await ctx.db.get("loopRuns", runId))
  if (run) await ctx.db.patch("loopRuns", run._id, { [field]: run[field] + 1 })
}

export const shortlistOf = async (ctx: QueryCtx, userId: Id<"users">, status: "new" | "saved") => {
  const of = (s: "new" | "saved" | "applied") =>
    ctx.db
      .query("jobLeads")
      .withIndex("by_userId_and_status", (q) => q.eq("userId", userId).eq("status", s))
      .order("desc")
      .take(60)
  if (status === "new") return (await of("new")).sort((a, b) => b.fit - a.fit)
  return [...(await of("saved")), ...(await of("applied"))].sort(
    (a, b) => b._creationTime - a._creationTime
  )
}

export const respondToLead = async (
  ctx: MutationCtx,
  lead: Doc<"jobLeads">,
  action: "save" | "favorite" | "dismiss"
) => {
  if (action === "dismiss") {
    await ctx.db.patch("jobLeads", lead._id, { status: "dismissed", feedback: "less" })
    return
  }
  if (lead.status !== "saved" && lead.status !== "applied")
    await countOnRun(ctx, lead.runId, "saved")
  await ctx.db.patch("jobLeads", lead._id, {
    status: lead.status === "applied" ? "applied" : "saved",
    ...(action === "favorite" && { feedback: "more" as const }),
  })
}

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

export const startRun = async (ctx: MutationCtx, loop: Doc<"loops">) => {
  const runId = await insertLoopRun(ctx, loop)
  const workflowId = await workflow.start(
    ctx,
    internal.api.workflows.findJobs,
    { runId },
    { onComplete: internal.api.loops.runEnded, context: { runId } }
  )
  await ctx.db.patch("loopRuns", runId, { workflowId })
  return runId
}

export const runLoopNow = async (ctx: MutationCtx, loop: Doc<"loops">) => {
  const last = await lastRunOf(ctx, loop._id)
  if (last && (last.status === "queued" || last.status === "running"))
    throw new ConvexError("This loop is already running.")
  const { ok } = await limits.limit(ctx, "runNow", { key: loop.userId })
  if (!ok)
    throw new ConvexError("You've run loops by hand 3 times today. They'll run tomorrow morning.")
  return startRun(ctx, loop)
}

export const profileFor = async (
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

// ponytail: a waiting role can close on its board before it's shown; the sheet still
// opens it, and the link says so.
export const fillShortlist = async (ctx: MutationCtx, userId: Id<"users">, loopId: Id<"loops">) => {
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
  return best
}

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
  const loop = await ctx.db.get("loops", run.loopId)
  log.set({
    summary: `${loop?.name ?? "A loop"}: you stopped it after ${run.scanned} roles`,
    outcome: "stopped",
    scanned: run.scanned,
    runMs: Date.now() - run.startedAt,
  })
  await keepLog(ctx, log)
}
