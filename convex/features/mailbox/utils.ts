import type { Id } from "../../_generated/dataModel"
import type { MutationCtx } from "../../_generated/server"

export const draftAad = (userId: string) => `mail-draft:${userId}`

export const deleteMailbox = async (ctx: MutationCtx, userId: Id<"users">) => {
  for await (const row of ctx.db
    .query("mailLabels")
    .withIndex("by_userId_and_name", (q) => q.eq("userId", userId)))
    await ctx.db.delete("mailLabels", row._id)
  for await (const row of ctx.db
    .query("mailEventLabels")
    .withIndex("by_userId_and_label_and_at", (q) => q.eq("userId", userId)))
    await ctx.db.delete("mailEventLabels", row._id)
  for await (const row of ctx.db
    .query("mailDrafts")
    .withIndex("by_userId_and_updatedAt", (q) => q.eq("userId", userId)))
    await ctx.db.delete("mailDrafts", row._id)
  for await (const row of ctx.db
    .query("mailTemplates")
    .withIndex("by_userId_and_updatedAt", (q) => q.eq("userId", userId)))
    await ctx.db.delete("mailTemplates", row._id)
}
