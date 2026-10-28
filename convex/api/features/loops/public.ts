import { paginationOptsValidator, paginationResultValidator } from "convex/server"
import { ConvexError, v } from "convex/values"
import type { Id } from "../../../_generated/dataModel"
import type { MutationCtx } from "../../../_generated/server"
import schema from "../../../schema"
import { arkMutation, authedMutation, authedQuery } from "../../../lib/functions"
import { companyFromUrl } from "../workflows/fit"
import { limits } from "../workflows/manager"
import { apiKeyOf, monthlyCredits } from "../workflows/sources"
import { maxLoops, switchAt } from "./catalog"
import { startRun } from "./internal"
import { isTimeZone, nextRunAt } from "./schedule"
import { leadStatuses, NewLoop, providerIds } from "./validators"

const ownLoop = async (ctx: MutationCtx, userId: Id<"users">, loopId: Id<"loops">) => {
  const loop = await ctx.db.get("loops", loopId)
  if (!loop || loop.userId !== userId) throw new ConvexError("That loop doesn't exist.")
  return loop
}

const list = authedQuery({
  args: {},
  returns: v.array(schema.doc("loops")),
  handler: (ctx) =>
    ctx.db
      .query("loops")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
      .take(maxLoops),
})

const create = arkMutation({
  args: NewLoop,
  returns: v.id("loops"),
  handler: async (ctx, loop) => {
    const count = (
      await ctx.db
        .query("loops")
        .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
        .take(maxLoops)
    ).length
    if (count >= maxLoops)
      throw new ConvexError(`You can have ${maxLoops} loops. Remove one to start another.`)
    if (loop.answers.remoteOnly && loop.answers.nearMe)
      throw new ConvexError("Pick remote only or on-site near you, not both.")
    if (!isTimeZone(loop.timeZone)) throw new ConvexError("That time zone isn't one we know.")
    const { auto, ...fields } = loop
    return ctx.db.insert("loops", {
      ...fields,
      userId: ctx.userId,
      active: auto,
      nextRunAt: nextRunAt(Date.now(), loop.at, loop.timeZone),
    })
  },
})

// Pausing keeps a loop and its history; resuming schedules the next morning.
const setActive = authedMutation({
  args: { loopId: v.id("loops"), active: v.boolean() },
  returns: v.null(),
  handler: async (ctx, { loopId, active }) => {
    const loop = await ownLoop(ctx, ctx.userId, loopId)
    await ctx.db.patch("loops", loopId, {
      active,
      nextRunAt: active ? nextRunAt(Date.now(), loop.at, loop.timeZone) : loop.nextRunAt,
    })
    return null
  },
})

// Removing a loop keeps its runs and the jobs it found, so the Runs tab still adds up.
const remove = authedMutation({
  args: { loopId: v.id("loops") },
  returns: v.null(),
  handler: async (ctx, { loopId }) => {
    await ownLoop(ctx, ctx.userId, loopId)
    await ctx.db.delete("loops", loopId)
    return null
  },
})

// A run outside the morning schedule, a few times a day per person.
const runNow = authedMutation({
  args: { loopId: v.id("loops") },
  returns: v.id("loopRuns"),
  handler: async (ctx, { loopId }) => {
    const loop = await ownLoop(ctx, ctx.userId, loopId)
    const last = await ctx.db
      .query("loopRuns")
      .withIndex("by_loopId_and_startedAt", (q) => q.eq("loopId", loopId))
      .order("desc")
      .first()
    if (last && (last.status === "queued" || last.status === "running"))
      throw new ConvexError("This loop is already running.")
    const { ok } = await limits.limit(ctx, "runNow", { key: ctx.userId })
    if (!ok)
      throw new ConvexError("You've run loops by hand 3 times today. They'll run tomorrow morning.")
    return startRun(ctx, loop)
  },
})

const runs = authedQuery({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(schema.doc("loopRuns")),
  handler: (ctx, { paginationOpts }) =>
    ctx.db
      .query("loopRuns")
      .withIndex("by_userId_and_startedAt", (q) => q.eq("userId", ctx.userId))
      .order("desc")
      .paginate(paginationOpts),
})

const vLeadStatus = v.union(...leadStatuses.map((s) => v.literal(s)))

const leads = authedQuery({
  args: { status: vLeadStatus, paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(schema.doc("jobLeads")),
  handler: (ctx, { status, paginationOpts }) =>
    ctx.db
      .query("jobLeads")
      .withIndex("by_userId_and_status", (q) => q.eq("userId", ctx.userId).eq("status", status))
      .order("desc")
      .paginate(paginationOpts),
})

// Saving, dismissing or applying to a lead. Applying adds it to Applications, and the
// run's counts follow so the Runs tab shows what came of each morning.
const setLeadStatus = authedMutation({
  args: {
    leadId: v.id("jobLeads"),
    status: v.union(v.literal("saved"), v.literal("dismissed"), v.literal("applied")),
  },
  returns: v.null(),
  handler: async (ctx, { leadId, status }) => {
    const lead = await ctx.db.get("jobLeads", leadId)
    if (!lead || lead.userId !== ctx.userId) throw new ConvexError("That job doesn't exist.")
    if (lead.status === status) return null
    const applicationId =
      status === "applied" && !lead.applicationId
        ? await ctx.db.insert("applications", {
            userId: ctx.userId,
            company: lead.company || companyFromUrl(lead.url),
            role: lead.title,
            status: "applied",
          })
        : lead.applicationId
    await ctx.db.patch("jobLeads", leadId, { status, applicationId })
    const run = await ctx.db.get("loopRuns", lead.runId)
    if (run) {
      const isSaved = (s: string) => s === "saved" || s === "applied"
      await ctx.db.patch("loopRuns", run._id, {
        saved: run.saved + Number(isSaved(status)) - Number(isSaved(lead.status)),
        applied: run.applied + Number(status === "applied") - Number(lead.status === "applied"),
      })
    }
    return null
  },
})

// Each source's credits this month, and whether runs can use it. The month comes from
// the page, since queries can't read the clock.
const sourceStatus = authedQuery({
  args: { month: v.string() },
  returns: v.array(
    v.object({
      provider: v.union(...providerIds.map((p) => v.literal(p))),
      configured: v.boolean(),
      used: v.number(),
      limit: v.number(),
      exhausted: v.boolean(),
      usable: v.boolean(),
    })
  ),
  handler: async (ctx, { month }) => {
    const rows = []
    for (const provider of providerIds) {
      const usage = await ctx.db
        .query("sourceUsage")
        .withIndex("by_provider_and_month", (q) => q.eq("provider", provider).eq("month", month))
        .unique()
      const used = usage?.used ?? 0
      const limit = monthlyCredits(provider)
      const configured = Boolean(apiKeyOf(provider))
      const exhausted = Boolean(usage?.exhaustedAt)
      rows.push({
        provider,
        configured,
        used,
        limit,
        exhausted,
        usable: configured && !exhausted && used < limit * switchAt,
      })
    }
    return rows
  },
})

export const publicApi = {
  list,
  create,
  setActive,
  remove,
  runNow,
  runs,
  leads,
  setLeadStatus,
  sourceStatus,
}
