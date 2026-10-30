import type { MutationCtx } from "../../_generated/server"
import type { Id } from "../../_generated/dataModel"

// For account deletion.
export const deleteViews = async (ctx: MutationCtx, userId: Id<"users">) => {
  for await (const view of ctx.db
    .query("views")
    .withIndex("by_userId", (q) => q.eq("userId", userId)))
    await ctx.db.delete("views", view._id)
}
