import type { MutationCtx } from "../../_generated/server"
import type { Id } from "../../_generated/dataModel"
import { ConvexError } from "convex/values"
import { maxGoals } from "./validators"

export const dayOf = (ms: number) => new Date(ms).toISOString().slice(0, 10)

export const shift = (day: string, byMs: number) => dayOf(Date.parse(day) + byMs)

export const own = async (ctx: MutationCtx, userId: Id<"users">, id: Id<"goals">) => {
  const goal = await ctx.db.get("goals", id)
  if (goal?.userId !== userId) throw new ConvexError("That goal isn't yours.")
  return goal
}

export const ownLoop = async (
  ctx: MutationCtx,
  userId: Id<"users">,
  loopId?: Id<"loops"> | null
) => {
  if (loopId && (await ctx.db.get("loops", loopId))?.userId !== userId)
    throw new ConvexError("That loop isn't yours.")
}

export const roomFor = async (ctx: MutationCtx, userId: Id<"users">) => {
  const existing = await ctx.db
    .query("goals")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .take(maxGoals)
  if (existing.length >= maxGoals) throw new ConvexError(`You can keep ${maxGoals} goals.`)
}

// For account deletion.
export const deleteGoals = async (ctx: MutationCtx, userId: Id<"users">) => {
  for await (const goal of ctx.db
    .query("goals")
    .withIndex("by_userId", (q) => q.eq("userId", userId)))
    await ctx.db.delete("goals", goal._id)
}
