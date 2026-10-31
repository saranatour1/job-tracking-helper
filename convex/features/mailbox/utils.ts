import type { Id } from "../../_generated/dataModel"
import type { MutationCtx } from "../../_generated/server"

export const draftAad = (userId: string) => `mail-draft:${userId}`

// A reply or forward carries on the same subject.
export const threadSubject = (subject: string) =>
  subject
    .replace(/^\s*((re|fwd?|aw)\s*:\s*)+/i, "")
    .trim()
    .toLowerCase()

type ThreadEmail = {
  subject: string
  sent: boolean
  from: string
  to?: string
  applicationId?: Id<"applications">
}

const otherSide = (mail: ThreadEmail) => (mail.sent ? mail.to : mail.from)?.toLowerCase()

// The application says it's the same conversation. Without one, the other person has to.
export const sameThread = (a: ThreadEmail, b: ThreadEmail) =>
  threadSubject(a.subject) === threadSubject(b.subject) &&
  a.applicationId === b.applicationId &&
  (a.applicationId !== undefined || otherSide(a) === otherSide(b))

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
