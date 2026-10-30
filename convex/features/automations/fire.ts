import { internal } from "../../_generated/api"
import type { Id } from "../../_generated/dataModel"
import type { MutationCtx } from "../../_generated/server"
import type { AutomationEvent } from "./validators"

/** Starts the person's workflows this event matches, in a moment. Cheap when none do. */
export const fireEvent = async (ctx: MutationCtx, userId: Id<"users">, event: AutomationEvent) => {
  const listening = await ctx.db
    .query("automations")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .take(30)
  if (listening.some((a) => a.active && a.trigger.kind === event.kind))
    await ctx.scheduler.runAfter(0, internal.automations.onEvent, { userId, event })
}
