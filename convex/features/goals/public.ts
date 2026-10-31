import { v } from "convex/values"
import type { Doc } from "../../_generated/dataModel"
import { docOf } from "../../lib/docs"
import { goalsTable } from "./models"
import { internalQuery } from "../../_generated/server"
import { arkMutation, authedMutation, authedQuery } from "../../lib/functions"
import {
  maxGoalApplications,
  maxGoals,
  maxEvaluated,
  NewGoal,
  UpdateGoal,
  vToEvaluate,
} from "./validators"
import { dayOf, shift, own, ownLoop, roomFor } from "./utils"
import { logEdit } from "../activity/utils"
import { keys, linesOf } from "../email/utils"
import { vTimeline } from "../email/validators"

const list = authedQuery({
  args: {},
  returns: v.array(docOf("goals", goalsTable)),
  handler: (ctx) =>
    ctx.db
      .query("goals")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
      .take(maxGoals),
})

// The page shows the newest 50 of everything, so that's enough of each, and only those are
// decrypted. Mail is looked for among the newest 1,000 in the period.
const activity = authedQuery({
  args: { id: v.id("goals") },
  returns: v.object({
    notes: v.array(v.object({ at: v.number(), who: v.string(), text: v.string() })),
    mail: vTimeline,
  }),
  handler: async (ctx, { id }) => {
    const goal = await ctx.db.get("goals", id)
    if (goal?.userId !== ctx.userId) return { notes: [], mail: [] }
    const from = Date.parse(goal.start)
    const to = Date.parse(goal.target) + 24 * 60 * 60 * 1000
    const applications = (
      await ctx.db
        .query("applications")
        .withIndex("by_userId_and_goalId", (q) => q.eq("userId", ctx.userId).eq("goalId", id))
        .order("desc")
        .take(maxGoalApplications)
    ).filter((a) => a.trashedAt === undefined)
    const notes = applications
      .flatMap((a) => (a.notes ?? []).map((n) => ({ at: n.at, who: a.company, text: n.text })))
      .filter((n) => n.at >= from && n.at < to)
      .sort((a, b) => b.at - a.at)
      .slice(0, 50)
    const ids = new Set(applications.map((a) => a._id))
    const k = await keys().catch(() => null)
    // Dates a goal can hold but that make no range, like a target before the start.
    if (!k || !(from < to)) return { notes, mail: [] }
    const mine: Doc<"mailEvents">[] = []
    let looked = 0
    for await (const e of ctx.db
      .query("mailEvents")
      .withIndex("by_userId_and_at", (q) => q.eq("userId", ctx.userId).gte("at", from).lt("at", to))
      .order("desc")) {
      if (e.applicationId && ids.has(e.applicationId) && e.box !== "trash") mine.push(e)
      if (mine.length >= 50 || ++looked >= 1000) break
    }
    return { notes, mail: await linesOf(k, ctx.userId, mine) }
  },
})

const create = arkMutation({
  args: NewGoal,
  returns: v.id("goals"),
  handler: async (ctx, { loopId, ...goal }) => {
    await roomFor(ctx, ctx.userId)
    await ownLoop(ctx, ctx.userId, loopId)
    const id = await ctx.db.insert("goals", {
      ...goal,
      ...(loopId && { loopId }),
      userId: ctx.userId,
    })
    await logEdit(ctx, ctx.userId, "goal.create", `Added the goal ${goal.name}`)
    return id
  },
})

const update = arkMutation({
  args: UpdateGoal,
  returns: v.null(),
  handler: async (ctx, { id, loopId, ...patch }) => {
    await own(ctx, ctx.userId, id)
    await ownLoop(ctx, ctx.userId, loopId)
    await ctx.db.patch("goals", id, {
      ...patch,
      ...(loopId !== undefined && { loopId: loopId ?? undefined }),
    })
    await logEdit(ctx, ctx.userId, "goal.update", "Changed a goal")
    return null
  },
})

const remove = authedMutation({
  args: { id: v.id("goals") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const { name } = await own(ctx, ctx.userId, id)
    await ctx.db.delete("goals", id)
    await logEdit(ctx, ctx.userId, "goal.remove", `Removed the goal ${name}`)
    for await (const application of ctx.db
      .query("applications")
      .withIndex("by_userId_and_goalId", (q) => q.eq("userId", ctx.userId).eq("goalId", id)))
      await ctx.db.patch("applications", application._id, { goalId: undefined })
    return null
  },
})

const retry = authedMutation({
  args: { id: v.id("goals") },
  returns: v.id("goals"),
  handler: async (ctx, { id }) => {
    const { _id, _creationTime, start, target, milestones, ...goal } = await own(
      ctx,
      ctx.userId,
      id
    )
    await roomFor(ctx, ctx.userId)
    const today = dayOf(Date.now())
    const moved = Date.parse(today) - Date.parse(start)
    await logEdit(ctx, ctx.userId, "goal.retry", `Started the goal ${goal.name} again`)
    return ctx.db.insert("goals", {
      ...goal,
      start: today,
      target: shift(target, moved),
      milestones: milestones.map((m) => ({
        name: m.name,
        done: false,
        ...(m.target && { target: shift(m.target, moved) }),
      })),
    })
  },
})

const toEvaluate = internalQuery({
  args: { userId: v.id("users"), id: v.id("goals") },
  returns: vToEvaluate,
  handler: async (ctx, { userId, id }) => {
    const goal = await ctx.db.get("goals", id)
    if (goal?.userId !== userId) return null
    const applications = await ctx.db
      .query("applications")
      .withIndex("by_userId_and_trashedAt", (q) =>
        q.eq("userId", userId).eq("trashedAt", undefined)
      )
      .order("desc")
      .take(maxEvaluated)
    return {
      goal: {
        name: goal.name,
        summary: goal.summary,
        milestones: goal.milestones.map((m) => m.name),
      },
      applications: applications.map((a) => ({
        id: a._id,
        company: a.company,
        role: a.role,
        status: a.status,
        location: a.location ?? "",
        labels: a.labels ?? [],
        description: (a.description ?? "").slice(0, 600),
        onGoal: a.goalId === id,
      })),
    }
  },
})

export const goalsApi = { list, activity, create, update, remove, retry, toEvaluate }
