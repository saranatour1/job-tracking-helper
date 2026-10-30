import { ConvexError, v } from "convex/values"
import schema from "../../schema"
import { arkMutation, authedMutation, authedQuery } from "../../lib/functions"
import { maxViews, ViewFields } from "./validators"

const list = authedQuery({
  args: {},
  returns: v.array(schema.doc("views")),
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
    const existing = await ctx.db
      .query("views")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
      .take(maxViews)
    if (existing.length >= maxViews) throw new ConvexError(`You can keep ${maxViews} views.`)
    return ctx.db.insert("views", { ...view, userId: ctx.userId })
  },
})

const remove = authedMutation({
  args: { id: v.id("views") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const view = await ctx.db.get("views", id)
    if (view?.userId !== ctx.userId) throw new ConvexError("That view isn't yours.")
    await ctx.db.delete("views", id)
    return null
  },
})

export const viewsApi = { list, create, remove }
