import type { Id } from "../../_generated/dataModel"
import type { MutationCtx } from "../../_generated/server"

export const deleteContacts = async (ctx: MutationCtx, userId: Id<"users">) => {
  for await (const contact of ctx.db
    .query("contacts")
    .withIndex("by_userId_and_lastAt", (q) => q.eq("userId", userId)))
    await ctx.db.delete("contacts", contact._id)
}
