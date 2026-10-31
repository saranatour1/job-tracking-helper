import { v } from "convex/values"
import { internal } from "../_generated/api"
import { internalMutation, internalQuery } from "../_generated/server"

export const fillBoxes = internalMutation({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  returns: v.null(),
  handler: async (ctx, { cursor }) => {
    const page = await ctx.db
      .query("mailEvents")
      .paginate({ cursor: cursor ?? null, numItems: 100 })
    for (const event of page.page)
      if (event.box === undefined)
        await ctx.db.patch("mailEvents", event._id, {
          box: event.by === "sent" ? "sent" : "inbox",
          readAt: event.readAt ?? event.at,
        })
    if (!page.isDone)
      await ctx.scheduler.runAfter(0, internal.api.migrations.fillBoxes, {
        cursor: page.continueCursor,
      })
    return null
  },
})

export const boxesLeft = internalQuery({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    let left = 0
    for await (const event of ctx.db.query("mailEvents")) if (event.box === undefined) left++
    return left
  },
})
