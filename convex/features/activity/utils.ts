import { ConvexError } from "convex/values"
import { internal } from "../../_generated/api"
import type { Id } from "../../_generated/dataModel"
import type { ActionCtx, MutationCtx } from "../../_generated/server"
import { workLog } from "../../lib/log"
import type { ActivityEvent } from "./validators"

type WorkLog = ReturnType<typeof workLog>

const textOf = (value: unknown) => (typeof value === "string" && value ? value : undefined)

// A thrown Error's event holds an object, and work that set its own reason holds a string.
const errorOf = (event: Record<string, unknown>) =>
  textOf(event.error) ??
  textOf((event.error as { message?: unknown } | undefined)?.message) ??
  textOf(event.aiError)

/** The row an evlog event becomes. Work with no owner, like refreshing a board, has none. */
export const activityOf = (event: Record<string, unknown> | null): ActivityEvent | null => {
  const userId = textOf(event?.userId)
  if (!event || !userId) return null
  const failed = event.level === "error" || event.outcome === "failed"
  const summary = textOf(event.summary)
  const error = errorOf(event)
  const durationMs = event.runMs ?? event.durationMs
  const [applicationId, prefillId, automationId] = [
    textOf(event.applicationId),
    textOf(event.prefillId),
    textOf(event.automationId),
  ]
  return {
    userId: userId as Id<"users">,
    work: textOf(event.work) ?? "work",
    at: Date.parse(textOf(event.timestamp) ?? "") || Date.now(),
    failed,
    outcome: textOf(event.outcome) ?? (failed ? "failed" : "done"),
    ...(summary && { summary: summary.slice(0, 300) }),
    ...(error && { error: error.slice(0, 500) }),
    ...(typeof durationMs === "number" && { durationMs }),
    ...(applicationId && { applicationId: applicationId as Id<"applications"> }),
    ...(prefillId && { prefillId: prefillId as Id<"prefills"> }),
    ...(automationId && { automationId: automationId as Id<"automations"> }),
  }
}

/** Emits the log line, and keeps it for its owner's Activity. */
export const keepLog = async (ctx: MutationCtx, log: WorkLog) => {
  const row = activityOf(log.emit() as Record<string, unknown> | null)
  if (row) await ctx.db.insert("activityEvents", row)
}

/** The same from an action. A failed write mustn't fail the work it's describing. */
export const keepLogFromAction = async (ctx: ActionCtx, log: WorkLog) => {
  const row = activityOf(log.emit() as Record<string, unknown> | null)
  if (row) await ctx.runMutation(internal.activity.record, { event: row }).catch(() => null)
}

/** A readable reason from something thrown, with the message a person was shown. */
export const reasonOf = (cause: unknown) =>
  cause instanceof ConvexError && typeof cause.data === "string"
    ? cause.data
    : cause instanceof Error
      ? cause.message
      : "Something went wrong."

export const deleteActivity = async (ctx: MutationCtx, userId: Id<"users">) => {
  for await (const row of ctx.db
    .query("activityEvents")
    .withIndex("by_userId_and_at", (q) => q.eq("userId", userId)))
    await ctx.db.delete("activityEvents", row._id)
}
