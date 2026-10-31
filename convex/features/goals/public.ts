import { v } from "convex/values"
import schema from "../../schema"
import { internalQuery } from "../../_generated/server"
import { arkMutation, authedMutation, authedQuery } from "../../lib/functions"
import { maxGoals, maxEvaluated, NewGoal, UpdateGoal, vToEvaluate } from "./validators"
import { dayOf, shift, own, ownLoop, roomFor } from "./utils"
import { logEdit } from "../activity/utils"

const list = authedQuery({
  args: {},
  returns: v.array(schema.doc("goals")),
  handler: (ctx) =>
    ctx.db
      .query("goals")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
      .take(maxGoals),
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

export const goalsApi = { list, create, update, remove, retry, toEvaluate }
