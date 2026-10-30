import { type } from "arktype"
import { ConvexError, v } from "convex/values"
import schema from "../../../schema"
import type { Id } from "../../../_generated/dataModel"
import type { MutationCtx } from "../../../_generated/server"
import { arkId } from "../../../lib/ark"
import { arkMutation, authedQuery } from "../../../lib/functions"
import { GoalFields } from "./models"

// Few enough to read at once, and plenty for one person's search.
const maxGoals = 50

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

const create = arkMutation({
  args: GoalFields,
  returns: v.id("goals"),
  handler: async (ctx, goal) => {
    const existing = await ctx.db
      .query("goals")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
      .take(maxGoals)
    if (existing.length >= maxGoals) throw new ConvexError(`You can keep ${maxGoals} goals.`)
    return ctx.db.insert("goals", { ...goal, userId: ctx.userId })
  },
})

const update = arkMutation({
  args: type({ id: arkId("goals") }).and(GoalFields.partial()),
  returns: v.null(),
  handler: async (ctx, { id, ...patch }) => {
    await own(ctx, ctx.userId, id)
    await ctx.db.patch("goals", id, patch)
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

// For account deletion.
export const deleteGoals = async (ctx: MutationCtx, userId: Id<"users">) => {
  for await (const goal of ctx.db
    .query("goals")
    .withIndex("by_userId", (q) => q.eq("userId", userId)))
    await ctx.db.delete("goals", goal._id)
}

export const goalsApi = { list, create, update, remove }
