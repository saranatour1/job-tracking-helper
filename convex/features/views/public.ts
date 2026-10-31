import { ConvexError, v } from "convex/values"
import type { Id } from "../../_generated/dataModel"
import type { MutationCtx } from "../../_generated/server"
import { docOf } from "../../lib/docs"
import { viewsTable } from "./models"
import { arkMutation, authedMutation, authedQuery } from "../../lib/functions"
import { maxViews, ViewFields } from "./validators"
import { logEdit } from "../activity/utils"

export const createView = async (
  ctx: MutationCtx,
  userId: Id<"users">,
  view: typeof ViewFields.infer
) => {
  const existing = await ctx.db
    .query("views")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .take(maxViews)
  if (existing.length >= maxViews) throw new ConvexError(`You can keep ${maxViews} views.`)
  return ctx.db.insert("views", { ...view, userId })
}

const list = authedQuery({
  args: {},
  returns: v.array(docOf("views", viewsTable)),
  handler: (ctx) =>
    ctx.db
      .query("views")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
      .take(maxViews),
})

const create = arkMutation({
  args: ViewFields,
  returns: v.id("views"),
  handler: async (ctx, view) => {
    await logEdit(ctx, ctx.userId, "view.create", "Saved a board view")
    return createView(ctx, ctx.userId, view)
  },
})

const remove = authedMutation({
  args: { id: v.id("views") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const view = await ctx.db.get("views", id)
    if (view?.userId !== ctx.userId) throw new ConvexError("That view isn't yours.")
    await ctx.db.delete("views", id)
    await logEdit(ctx, ctx.userId, "view.remove", "Removed a board view")
    return null
  },
})

export const viewsApi = { list, create, remove }
