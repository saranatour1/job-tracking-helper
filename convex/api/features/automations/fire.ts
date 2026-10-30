import { internal } from "../../../_generated/api"
import type { Id } from "../../../_generated/dataModel"
import type { MutationCtx } from "../../../_generated/server"
import { type Infer, v } from "convex/values"
import { statuses } from "../applications/validators"
import { kinds as mailKinds } from "../email/match"

// Where the rest of the app says something happened that a workflow might start on. It
// only schedules `onEvent` by reference, so features that fire events never import the
// engine (whose Move application step changes statuses itself).

export const vAutomationEvent = v.union(
  v.object({
    kind: v.literal("mail"),
    mailKind: v.union(...mailKinds.map((k) => v.literal(k))),
    mailEventId: v.id("mailEvents"),
    applicationId: v.optional(v.id("applications")),
  }),
  v.object({
    kind: v.literal("status"),
    from: v.union(...statuses.map((s) => v.literal(s))),
    to: v.union(...statuses.map((s) => v.literal(s))),
    applicationId: v.id("applications"),
  }),
  v.object({
    kind: v.literal("booking"),
    bookingId: v.id("calendarEvents"),
    applicationId: v.optional(v.id("applications")),
  }),
  v.object({
    kind: v.literal("goal"),
    goalId: v.id("goals"),
    applicationId: v.id("applications"),
  })
)
export type AutomationEvent = Infer<typeof vAutomationEvent>

/** Starts the person's workflows this event matches, in a moment. Cheap when none do. */
export const fireEvent = async (ctx: MutationCtx, userId: Id<"users">, event: AutomationEvent) => {
  const listening = await ctx.db
    .query("automations")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .take(30)
  if (listening.some((a) => a.active && a.trigger.kind === event.kind))
    await ctx.scheduler.runAfter(0, internal.automations.onEvent, { userId, event })
}
