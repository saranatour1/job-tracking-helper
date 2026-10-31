import { paginationOptsValidator, paginationResultValidator } from "convex/server"
import { fitOf, logNewApplication, nextNumber } from "../applications/utils"
import { priorityFor } from "../applications/validators"
import { ConvexError, v } from "convex/values"
import { docOf } from "../../lib/docs"
import { loopsTable, loopRunsTable, jobLeadsTable } from "./models"
import { arkMutation, authedMutation, authedQuery } from "../../lib/functions"
import { fireEvent } from "../automations/fire"
import { maxGoals } from "../goals/validators"
import { limits } from "../workflows/manager"
import { apiKeyOf, monthlyCredits } from "../workflows/sources"
import { maxLoops, switchAt } from "./catalog"
import { startRun, stopRunNow, ownLoop, rowOf, lastRunOf, ownLead, countOnRun } from "./utils"
import { nextRunAt } from "./schedule"
import { NewLoop, UpdateLoop, vRespondArgs, vSourceStatus } from "./validators"
import { providerIds } from "../workflows/validators"
import { logEdit } from "../activity/utils"

const list = authedQuery({
  args: {},
  returns: v.array(docOf("loops", loopsTable)),
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
    await logEdit(ctx, ctx.userId, "loop.create", `Added the loop ${loop.name}`)
    return ctx.db.insert("loops", { ...rowOf(loop), userId: ctx.userId })
  },
})

const update = arkMutation({
  args: UpdateLoop,
  returns: v.null(),
  handler: async (ctx, { loopId, ...loop }) => {
    await ownLoop(ctx, ctx.userId, loopId)
    await ctx.db.patch("loops", loopId, rowOf(loop))
    await logEdit(ctx, ctx.userId, "loop.update", `Changed the loop ${loop.name}`)
    return null
  },
})

const setActive = authedMutation({
  args: { loopId: v.id("loops"), active: v.boolean() },
  returns: v.null(),
  handler: async (ctx, { loopId, active }) => {
    const loop = await ownLoop(ctx, ctx.userId, loopId)
    await ctx.db.patch("loops", loopId, {
      active,
      nextRunAt: active ? nextRunAt(Date.now(), loop.at, loop.timeZone) : loop.nextRunAt,
    })
    await logEdit(
      ctx,
      ctx.userId,
      "loop.active",
      `${active ? "Resumed" : "Paused"} the loop ${loop.name}`
    )
    return null
  },
})

const remove = authedMutation({
  args: { loopId: v.id("loops") },
  returns: v.null(),
  handler: async (ctx, { loopId }) => {
    const { name } = await ownLoop(ctx, ctx.userId, loopId)
    await ctx.db.delete("loops", loopId)
    for (const goal of await ctx.db
      .query("goals")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
      .take(maxGoals))
      if (goal.loopId === loopId) await ctx.db.patch("goals", goal._id, { loopId: undefined })
    await logEdit(ctx, ctx.userId, "loop.remove", `Removed the loop ${name}`)
    return null
  },
})

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
    await logEdit(ctx, ctx.userId, "loop.runNow", `Started the loop ${loop.name}`)
    return startRun(ctx, loop)
  },
})

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
  returns: paginationResultValidator(docOf("loopRuns", loopRunsTable)),
  handler: (ctx, { paginationOpts }) =>
    ctx.db
      .query("loopRuns")
      .withIndex("by_userId_and_startedAt", (q) => q.eq("userId", ctx.userId))
      .order("desc")
      .paginate(paginationOpts),
})

const shortlist = authedQuery({
  args: { status: v.union(v.literal("new"), v.literal("saved")) },
  returns: v.array(docOf("jobLeads", jobLeadsTable)),
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

const lead = authedQuery({
  args: { leadId: v.id("jobLeads") },
  returns: v.union(
    v.null(),
    v.object({
      lead: docOf("jobLeads", jobLeadsTable),
      text: v.string(),
      loopName: v.optional(v.string()),
    })
  ),
  handler: async (ctx, { leadId }) => {
    const lead = await ctx.db.get("jobLeads", leadId)
    if (!lead || lead.userId !== ctx.userId) return null
    const job = lead.jobId && (await ctx.db.get("jobs", lead.jobId))
    const loop = lead.loopId && (await ctx.db.get("loops", lead.loopId))
    return { lead, text: job?.text ?? lead.text ?? lead.snippet, loopName: loop?.name }
  },
})

const leadForApplication = authedQuery({
  args: { applicationId: v.id("applications") },
  returns: v.union(
    v.null(),
    v.object({
      lead: docOf("jobLeads", jobLeadsTable),
      text: v.string(),
      loopName: v.optional(v.string()),
    })
  ),
  handler: async (ctx, { applicationId }) => {
    const lead = await ctx.db
      .query("jobLeads")
      .withIndex("by_applicationId", (q) => q.eq("applicationId", applicationId))
      .first()
    if (!lead || lead.userId !== ctx.userId) return null
    const job = lead.jobId && (await ctx.db.get("jobs", lead.jobId))
    const loop = lead.loopId && (await ctx.db.get("loops", lead.loopId))
    return { lead, text: job?.text ?? lead.text ?? lead.snippet, loopName: loop?.name }
  },
})

const respond = authedMutation({
  args: vRespondArgs,
  returns: v.null(),
  handler: async (ctx, { leadId, action }) => {
    const lead = await ownLead(ctx, ctx.userId, leadId)
    if (action === "dismiss") {
      await ctx.db.patch("jobLeads", leadId, { status: "dismissed", feedback: "less" })
      await logEdit(ctx, ctx.userId, "loop.role", `Dismissed ${lead.title} · ${lead.company}`)
      return null
    }
    if (lead.status !== "saved" && lead.status !== "applied")
      await countOnRun(ctx, lead.runId, "saved")
    await ctx.db.patch("jobLeads", leadId, {
      status: lead.status === "applied" ? "applied" : "saved",
      ...(action === "favorite" && { feedback: "more" as const }),
    })
    await logEdit(
      ctx,
      ctx.userId,
      "loop.role",
      `${action === "favorite" ? "Favorited" : "Saved"} ${lead.title} · ${lead.company}`
    )
    return null
  },
})

const track = authedMutation({
  args: { leadId: v.id("jobLeads") },
  returns: v.id("applications"),
  handler: async (ctx, { leadId }) => {
    const lead = await ownLead(ctx, ctx.userId, leadId)
    const linked = lead.applicationId && (await ctx.db.get("applications", lead.applicationId))
    if (linked) {
      if (linked.trashedAt !== undefined || linked.archivedAt !== undefined)
        await ctx.db.patch("applications", linked._id, {
          trashedAt: undefined,
          archivedAt: undefined,
          purgeAt: undefined,
        })
      return linked._id
    }
    const goal = lead.loopId
      ? (
          await ctx.db
            .query("goals")
            .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
            .take(50)
        ).find((g) => g.loopId === lead.loopId)
      : undefined
    const applicationId = await ctx.db.insert("applications", {
      userId: ctx.userId,
      company: lead.company,
      role: lead.title,
      status: "saved",
      url: lead.url,
      number: await nextNumber(ctx, ctx.userId),
      ...(goal && { goalId: goal._id }),
      ...(lead.location && { location: lead.location }),
      labels: /remote/i.test(lead.location ?? "") ? ["Remote"] : [],
      ...(lead.snippet && { description: lead.snippet.slice(0, 5000) }),
      method: "Company site",
      priority: priorityFor(lead.fit),
      ...fitOf(lead),
      history: [{ status: "saved", at: Date.now() }],
    })
    await logNewApplication(ctx, ctx.userId, applicationId, lead.company)
    await ctx.db.patch("jobLeads", leadId, { status: "applied", applicationId })
    await countOnRun(ctx, lead.runId, "applied")
    if (goal) await fireEvent(ctx, ctx.userId, { kind: "goal", goalId: goal._id, applicationId })
    return applicationId
  },
})

// Each source's credits this month, and whether runs can use it. The month comes from
// the page, since queries can't read the clock.
const sourceStatus = authedQuery({
  args: { month: v.string() },
  returns: vSourceStatus,
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
  leadForApplication,
  create,
  update,
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
