import type { MutationCtx } from "../../_generated/server"
import type { Id } from "../../_generated/dataModel"
import { ConvexError } from "convex/values"
import { maxGoals, type NewGoal, type UpdateGoal } from "./validators"

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

export const createGoal = async (
  ctx: MutationCtx,
  userId: Id<"users">,
  { loopId, ...goal }: typeof NewGoal.infer
) => {
  await roomFor(ctx, userId)
  await ownLoop(ctx, userId, loopId)
  return ctx.db.insert("goals", { ...goal, ...(loopId && { loopId }), userId })
}

export const updateGoal = async (
  ctx: MutationCtx,
  userId: Id<"users">,
  { id, loopId, ...patch }: typeof UpdateGoal.infer
) => {
  await own(ctx, userId, id)
  await ownLoop(ctx, userId, loopId)
  await ctx.db.patch("goals", id, {
    ...patch,
    ...(loopId !== undefined && { loopId: loopId ?? undefined }),
  })
}
