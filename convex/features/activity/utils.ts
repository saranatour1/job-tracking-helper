import { ConvexError } from "convex/values"
import { internal } from "../../_generated/api"
import type { Id } from "../../_generated/dataModel"
import type { ActionCtx, MutationCtx } from "../../_generated/server"
import { workLog } from "../../lib/log"
import type { ActivityEvent } from "./validators"

type WorkLog = ReturnType<typeof workLog>

const textOf = (value: unknown) => (typeof value === "string" && value ? value : undefined)

const errorOf = (event: Record<string, unknown>) =>
  textOf(event.error) ??
  textOf((event.error as { message?: unknown } | undefined)?.message) ??
  textOf(event.aiError)

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

export const keepLog = async (ctx: MutationCtx, log: WorkLog) => {
  const row = activityOf(log.emit() as Record<string, unknown> | null)
  if (row) await ctx.db.insert("activityEvents", row)
}

export const keepLogFromAction = async (ctx: ActionCtx, log: WorkLog) => {
  const row = activityOf(log.emit() as Record<string, unknown> | null)
  if (row) await ctx.runMutation(internal.api.activity.record, { event: row }).catch(() => null)
}

type Links = {
  applicationId?: Id<"applications">
  prefillId?: Id<"prefills">
  automationId?: Id<"automations">
  failed?: string
}

const editLog = (userId: Id<"users">, work: string, summary: string, links: Links | undefined) => {
  const { failed, ...ids } = links ?? {}
  const log = workLog(work, { userId, ...ids })
  log.set({ summary, outcome: failed ? "failed" : "done", ...(failed && { error: failed }) })
  if (failed) log.setLevel("error")
  return log
}

export const logEdit = (
  ctx: MutationCtx,
  userId: Id<"users">,
  work: string,
  summary: string,
  links?: Links
) => keepLog(ctx, editLog(userId, work, summary, links))

export const logEditFromAction = (
  ctx: ActionCtx,
  userId: Id<"users">,
  work: string,
  summary: string,
  links?: Links
) => keepLogFromAction(ctx, editLog(userId, work, summary, links))

export const reasonOf = (cause: unknown) =>
  cause instanceof ConvexError && typeof cause.data === "string"
    ? cause.data
    : cause instanceof Error
      ? cause.message
      : "Something went wrong."
