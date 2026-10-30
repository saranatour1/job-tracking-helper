import type { EventKind } from "./validators"
import type { MutationCtx } from "../../_generated/server"
import type { Id } from "../../_generated/dataModel"

/** The kind a title suggests, for events added without one. */
export const kindOf = (title: string): EventKind =>
  /interview|screen|call|onsite|round/i.test(title)
    ? "interview"
    : /follow.?up/i.test(title)
      ? "followup"
      : "reminder"

export const byKey = (ctx: MutationCtx, userId: Id<"users">, key: string) =>
  ctx.db
    .query("calendarEvents")
    .withIndex("by_userId_and_key", (q) => q.eq("userId", userId).eq("key", key))
    .unique()

// For account deletion.
export const deleteCalendar = async (ctx: MutationCtx, userId: Id<"users">) => {
  for await (const row of ctx.db
    .query("calendarEvents")
    .withIndex("by_userId_and_key", (q) => q.eq("userId", userId)))
    await ctx.db.delete("calendarEvents", row._id)
  const row = await ctx.db
    .query("calendarSettings")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .unique()
  if (row) await ctx.db.delete("calendarSettings", row._id)
}
