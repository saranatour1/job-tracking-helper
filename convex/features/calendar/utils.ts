import type { EventKind } from "./validators"
import type { MutationCtx } from "../../_generated/server"
import type { Id } from "../../_generated/dataModel"

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
