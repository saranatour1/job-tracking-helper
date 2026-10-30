import { type } from "arktype"
import { ConvexError, v } from "convex/values"
import schema from "../../../schema"
import type { Id } from "../../../_generated/dataModel"
import { internalQuery, type MutationCtx } from "../../../_generated/server"
import { arkId } from "../../../lib/ark"
import { arkMutation, authedQuery } from "../../../lib/functions"
import { GoalFields } from "./models"

// Few enough to read at once, and plenty for one person's search.
const maxGoals = 50
// Applications Jev looks at in one re-evaluation, newest first.
const maxEvaluated = 30

// A loop to take roles from. null clears it; leaving it out keeps it.
const loopField = { "loopId?": arkId("loops").or("null") }

const dayOf = (ms: number) => new Date(ms).toISOString().slice(0, 10)
const shift = (day: string, byMs: number) => dayOf(Date.parse(day) + byMs)

const list = authedQuery({
  args: {},
  returns: v.array(schema.doc("goals")),
  handler: (ctx) =>
    ctx.db
      .query("goals")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
      .take(maxGoals),
})

const own = async (ctx: MutationCtx, userId: Id<"users">, id: Id<"goals">) => {
  const goal = await ctx.db.get("goals", id)
  if (goal?.userId !== userId) throw new ConvexError("That goal isn't yours.")
  return goal
}

const ownLoop = async (ctx: MutationCtx, userId: Id<"users">, loopId?: Id<"loops"> | null) => {
  if (loopId && (await ctx.db.get("loops", loopId))?.userId !== userId)
    throw new ConvexError("That loop isn't yours.")
}

const roomFor = async (ctx: MutationCtx, userId: Id<"users">) => {
  const existing = await ctx.db
    .query("goals")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .take(maxGoals)
  if (existing.length >= maxGoals) throw new ConvexError(`You can keep ${maxGoals} goals.`)
}

const create = arkMutation({
  args: GoalFields.and(loopField),
  returns: v.id("goals"),
  handler: async (ctx, { loopId, ...goal }) => {
    await roomFor(ctx, ctx.userId)
    await ownLoop(ctx, ctx.userId, loopId)
    return ctx.db.insert("goals", { ...goal, ...(loopId && { loopId }), userId: ctx.userId })
  },
})

const update = arkMutation({
  args: type({ id: arkId("goals") })
    .and(GoalFields.partial())
    .and(loopField),
  returns: v.null(),
  handler: async (ctx, { id, loopId, ...patch }) => {
    await own(ctx, ctx.userId, id)
    await ownLoop(ctx, ctx.userId, loopId)
    await ctx.db.patch("goals", id, {
      ...patch,
      ...(loopId !== undefined && { loopId: loopId ?? undefined }),
    })
    return null
  },
})

// The goal's applications stay; they just leave it.
const remove = arkMutation({
  args: type({ id: arkId("goals") }),
  returns: v.null(),
  handler: async (ctx, { id }) => {
    await own(ctx, ctx.userId, id)
    await ctx.db.delete("goals", id)
    for await (const application of ctx.db
      .query("applications")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.userId)))
      if (application.goalId === id)
        await ctx.db.patch("applications", application._id, { goalId: undefined })
    return null
  },
})

// A fresh go at a missed goal: the same goal again, starting today for the same length,
// with its milestones unticked and their dates moved along. The old one stays as it was.
const retry = arkMutation({
  args: type({ id: arkId("goals") }),
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

// What Jev reads when re-evaluating a goal: the goal, and the person's applications
// with whether each is on it already.
const toEvaluate = internalQuery({
  args: { userId: v.id("users"), id: v.id("goals") },
  returns: v.union(
    v.null(),
    v.object({
      goal: v.object({ name: v.string(), summary: v.string(), milestones: v.array(v.string()) }),
      applications: v.array(
        v.object({
          id: v.id("applications"),
          company: v.string(),
          role: v.string(),
          status: v.string(),
          location: v.string(),
          labels: v.array(v.string()),
          description: v.string(),
          onGoal: v.boolean(),
        })
      ),
    })
  ),
  handler: async (ctx, { userId, id }) => {
    const goal = await ctx.db.get("goals", id)
    if (goal?.userId !== userId) return null
    const applications = await ctx.db
      .query("applications")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .order("desc")
      .collect()
    return {
      goal: {
        name: goal.name,
        summary: goal.summary,
        milestones: goal.milestones.map((m) => m.name),
      },
      applications: applications
        .filter((a) => a.trashedAt === undefined)
        .slice(0, maxEvaluated)
        .map((a) => ({
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

// For account deletion.
export const deleteGoals = async (ctx: MutationCtx, userId: Id<"users">) => {
  for await (const goal of ctx.db
    .query("goals")
    .withIndex("by_userId", (q) => q.eq("userId", userId)))
    await ctx.db.delete("goals", goal._id)
}

export const goalsApi = { list, create, update, remove, retry, toEvaluate }
