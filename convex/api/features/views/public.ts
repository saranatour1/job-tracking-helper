import { ConvexError, v } from "convex/values"
import schema from "../../../schema"
import type { Id } from "../../../_generated/dataModel"
import type { MutationCtx } from "../../../_generated/server"
import { authedMutation, authedQuery } from "../../../lib/functions"
import { vViewFields } from "./models"

// Few enough to read at once, and plenty for tabs along the top of Applications.
const maxViews = 50

const list = authedQuery({
  args: {},
  returns: v.array(schema.doc("views")),
  handler: (ctx) =>
    ctx.db
      .query("views")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
      .take(maxViews),
})

const create = authedMutation({
  args: vViewFields,
  returns: v.id("views"),
  handler: async (ctx, view) => {
    const name = view.name.trim().slice(0, 60)
    if (!name) throw new ConvexError("Give the view a name.")
    const existing = await ctx.db
      .query("views")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
      .take(maxViews)
    if (existing.length >= maxViews) throw new ConvexError(`You can keep ${maxViews} views.`)
    // Caps what's stored, since anyone can call this with anything.
    const filters = Object.fromEntries(
      Object.entries(view.filters)
        .slice(0, 10)
        .map(([field, values]) => [
          field.slice(0, 20),
          values.slice(0, 50).map((s) => s.slice(0, 100)),
        ])
    )
    return ctx.db.insert("views", {
      ...view,
      name,
      description: view.description.trim().slice(0, 300),
      filters,
      userId: ctx.userId,
    })
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

// For account deletion.
export const deleteViews = async (ctx: MutationCtx, userId: Id<"users">) => {
  for await (const view of ctx.db
    .query("views")
    .withIndex("by_userId", (q) => q.eq("userId", userId)))
    await ctx.db.delete("views", view._id)
}

export const viewsApi = { list, create, remove }
