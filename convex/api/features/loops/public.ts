import { paginationOptsValidator, paginationResultValidator } from "convex/server"
import { nextNumber } from "../applications/public"
import { priorityFor } from "../applications/validators"
import { ConvexError, v } from "convex/values"
import type { Id } from "../../../_generated/dataModel"
import type { MutationCtx } from "../../../_generated/server"
import schema from "../../../schema"
import { arkMutation, authedMutation, authedQuery } from "../../../lib/functions"
import { limits } from "../workflows/manager"
import { apiKeyOf, monthlyCredits } from "../workflows/sources"
import { maxLoops, switchAt } from "./catalog"
import { startRun, stopRunNow } from "./internal"
import { isTimeZone, nextRunAt } from "./schedule"
import { NewLoop, providerIds } from "./validators"

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
    const { auto, prompt, ...fields } = loop
    return ctx.db.insert("loops", {
      ...fields,
      ...(prompt && { prompt }),
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
    const last = await lastRunOf(ctx, loopId)
    if (last && (last.status === "queued" || last.status === "running"))
      throw new ConvexError("This loop is already running.")
    const { ok } = await limits.limit(ctx, "runNow", { key: ctx.userId })
    if (!ok)
      throw new ConvexError("You've run loops by hand 3 times today. They'll run tomorrow morning.")
    return startRun(ctx, loop)
  },
})

const lastRunOf = (ctx: MutationCtx, loopId: Id<"loops">) =>
  ctx.db
    .query("loopRuns")
    .withIndex("by_loopId_and_startedAt", (q) => q.eq("loopId", loopId))
    .order("desc")
    .first()

// Stops the loop's run in progress, if there is one.
const stopRun = authedMutation({
  args: { loopId: v.id("loops") },
  returns: v.null(),
  handler: async (ctx, { loopId }) => {
    await ownLoop(ctx, ctx.userId, loopId)
    const run = await lastRunOf(ctx, loopId)
    if (!run || (run.status !== "queued" && run.status !== "running"))
      throw new ConvexError("This loop isn't running.")
    await stopRunNow(ctx, run)
    return null
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

// The person's shortlist ("new": what their loops picked for them, best first) or the
// jobs they kept: saved for later or added to the tracker, most recent first. Small by
// design: a loop only adds as many as its size allows.
const shortlist = authedQuery({
  args: { status: v.union(v.literal("new"), v.literal("saved")) },
  returns: v.array(schema.doc("jobLeads")),
  handler: async (ctx, { status }) => {
    const of = (s: "new" | "saved" | "applied") =>
      ctx.db
        .query("jobLeads")
        .withIndex("by_userId_and_status", (q) => q.eq("userId", ctx.userId).eq("status", s))
        .order("desc")
        .take(60)
    if (status === "new") return (await of("new")).sort((a, b) => b.fit - a.fit)
    return [...(await of("saved")), ...(await of("applied"))].sort(
      (a, b) => b._creationTime - a._creationTime
    )
  },
})

// One job with its whole description, for the job sheet.
const lead = authedQuery({
  args: { leadId: v.id("jobLeads") },
  returns: v.union(
    v.null(),
    v.object({ lead: schema.doc("jobLeads"), text: v.string(), loopName: v.optional(v.string()) })
  ),
  handler: async (ctx, { leadId }) => {
    const lead = await ctx.db.get("jobLeads", leadId)
    if (!lead || lead.userId !== ctx.userId) return null
    const job = lead.jobId && (await ctx.db.get("jobs", lead.jobId))
    const loop = lead.loopId && (await ctx.db.get("loops", lead.loopId))
    return { lead, text: lead.text ?? job?.text ?? lead.snippet, loopName: loop?.name }
  },
})

const ownLead = async (ctx: MutationCtx, userId: Id<"users">, leadId: Id<"jobLeads">) => {
  const lead = await ctx.db.get("jobLeads", leadId)
  if (!lead || lead.userId !== userId) throw new ConvexError("That job doesn't exist.")
  return lead
}

// Keeps the run's counts in step as people act, so the Runs tab shows what came of
// each morning.
const countOnRun = async (
  ctx: MutationCtx,
  runId: Id<"loopRuns"> | undefined,
  field: "saved" | "applied"
) => {
  const run = runId && (await ctx.db.get("loopRuns", runId))
  if (run) await ctx.db.patch("loopRuns", run._id, { [field]: run[field] + 1 })
}

// The morning decisions. Save keeps it for later. Favorite keeps it too and tells
// tomorrow's runs "more like this"; Dismiss drops it and tells them "not like this".
const respond = authedMutation({
  args: {
    leadId: v.id("jobLeads"),
    action: v.union(v.literal("save"), v.literal("favorite"), v.literal("dismiss")),
  },
  returns: v.null(),
  handler: async (ctx, { leadId, action }) => {
    const lead = await ownLead(ctx, ctx.userId, leadId)
    if (action === "dismiss") {
      await ctx.db.patch("jobLeads", leadId, { status: "dismissed", feedback: "less" })
      return null
    }
    if (lead.status !== "saved" && lead.status !== "applied")
      await countOnRun(ctx, lead.runId, "saved")
    await ctx.db.patch("jobLeads", leadId, {
      status: lead.status === "applied" ? "applied" : "saved",
      ...(action === "favorite" && { feedback: "more" as const }),
    })
    return null
  },
})

// Adds the job to Applications as saved, with what the loop already knows about it: its
// link, location, a Remote label, the posting's summary, and a priority from Jev's match.
const track = authedMutation({
  args: { leadId: v.id("jobLeads") },
  returns: v.id("applications"),
  handler: async (ctx, { leadId }) => {
    const lead = await ownLead(ctx, ctx.userId, leadId)
    if (lead.applicationId) return lead.applicationId
    const applicationId = await ctx.db.insert("applications", {
      userId: ctx.userId,
      company: lead.company,
      role: lead.title,
      status: "saved",
      url: lead.url,
      number: await nextNumber(ctx, ctx.userId),
      ...(lead.location && { location: lead.location }),
      labels: /remote/i.test(lead.location ?? "") ? ["Remote"] : [],
      ...(lead.snippet && { description: lead.snippet.slice(0, 5000) }),
      method: "Company site",
      priority: priorityFor(lead.fit),
      history: [{ status: "saved", at: Date.now() }],
    })
    await ctx.db.patch("jobLeads", leadId, { status: "applied", applicationId })
    await countOnRun(ctx, lead.runId, "applied")
    return applicationId
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
  stopRun,
  runs,
  shortlist,
  lead,
  respond,
  track,
  sourceStatus,
}
