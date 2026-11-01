import { v } from "convex/values"
import { internalQuery } from "../../_generated/server"

const isAnonymous = internalQuery({
  args: { userId: v.id("users") },
  returns: v.boolean(),
  handler: async (ctx, { userId }) => Boolean((await ctx.db.get("users", userId))?.anonymous),
})

export const internalApi = { isAnonymous }
