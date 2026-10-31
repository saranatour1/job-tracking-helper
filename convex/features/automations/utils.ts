import type { MutationCtx, QueryCtx } from "../../_generated/server"
import type { Id, Doc } from "../../_generated/dataModel"
import { ConvexError, type Infer } from "convex/values"
import {
  type Trigger,
  nextScheduledAt,
  type vLogEntry,
  type RunContext,
  type Block,
  fill,
  emailAddress,
  holds,
  vAutomationEvent,
} from "./validators"
import { deleteRuns, insertRun, patchRun } from "./counts"
import type { WorkflowCtx, WorkflowId } from "@convex-dev/workflow"
import { internal, components } from "../../_generated/api"
import { workflow, limits as rates } from "../workflows/manager"
import { statusLabels, limits as applicationLimits } from "../applications/validators"
import { keys, openJson, aad } from "../email/utils"
import { MailNote } from "../email/validators"
import { changeStatus } from "../applications/utils"
import { wallOf, fromWall, instantOf } from "../booking/slots"
import { kindOf } from "../calendar/utils"
import { lastRunOf, insertLoopRun, stopRunNow } from "../loops/utils"

export const own = async (ctx: MutationCtx, userId: Id<"users">, id: Id<"automations">) => {
  const automation = await ctx.db.get("automations", id)
  if (automation?.userId !== userId) throw new ConvexError("That workflow isn't yours.")
  return automation
}

export const nextRunOf = (trigger: Trigger, active: boolean) =>
  active && trigger.kind === "schedule" ? nextScheduledAt(Date.now(), trigger) : undefined

export const runsOf = (ctx: MutationCtx, automationId: Id<"automations">) =>
  ctx.db
    .query("automationRuns")
    .withIndex("by_automationId_and_startedAt", (q) => q.eq("automationId", automationId))
    .take(500)

export const deleteWorkflow = async (ctx: MutationCtx, automation: Doc<"automations">) => {
  for (const run of await runsOf(ctx, automation._id))
    if (run.status === "running") await cancelRun(ctx, run)
  await deleteRuns(ctx, await runsOf(ctx, automation._id))
  await ctx.db.delete("automations", automation._id)
}

export type LogEntry = Infer<typeof vLogEntry>

export const runBlock = async (
  step: WorkflowCtx,
  runId: Id<"automationRuns">,
  at: string
): Promise<"next" | "stop" | { error: string }> => {
  const done = await step.runMutation(internal.api.automations.runStep, { runId, at })
  if (done.error) return { error: done.error }
  if ("stop" in done && done.stop) return "stop"
  const { waitMs } = done
  if ("email" in done && done.email) {
    const failed = await step.runAction(internal.api.automationActions.sendMail, { runId, at })
    if (failed) return { error: failed }
  }
  if ("loopRunId" in done && done.loopRunId) {
    const loopRunId = done.loopRunId
    const error = await step
      .runWorkflow(internal.api.workflows.findJobs, { runId: loopRunId })
      .then(() => undefined)
      .catch((cause: unknown) => (cause instanceof Error ? cause.message : "it failed"))
    const failed = await step.runMutation(internal.api.automations.foundRoles, {
      runId,
      at,
      loopRunId,
      error,
    })
    if (failed) return { error: failed }
  }
  if (waitMs > 0) {
    await step.sleep(waitMs, { name: `wait ${at}` })
    await step.runMutation(internal.api.automations.finishStep, { runId, at })
  }
  return "next"
}

export const keptRuns = 50

export const startRun = async (
  ctx: MutationCtx,
  automation: Doc<"automations">,
  trigger: "manual" | "schedule" | "event",
  context?: RunContext
) => {
  const runId = await insertRun(ctx, {
    automationId: automation._id,
    userId: automation.userId,
    name: automation.name,
    trigger,
    ...(context && { context }),
    steps: automation.steps,
    status: "running",
    startedAt: Date.now(),
    log: [],
  })
  const workflowId = await workflow.start(
    ctx,
    internal.api.automations.run,
    { runId },
    { onComplete: internal.api.automations.ended, context: { runId } }
  )
  await ctx.db.patch("automationRuns", runId, { workflowId })
  const older = await ctx.db
    .query("automationRuns")
    .withIndex("by_automationId_and_startedAt", (q) => q.eq("automationId", automation._id))
    .order("desc")
    .take(keptRuns + 10)
  await deleteRuns(
    ctx,
    older.slice(keptRuns).filter((r) => r.status !== "running")
  )
  return runId
}

export const setLog = async (
  ctx: MutationCtx,
  runId: Doc<"automationRuns">["_id"],
  entry: LogEntry
) => {
  const found = await ctx.db.get("automationRuns", runId)
  if (!found) return
  await ctx.db.patch("automationRuns", runId, {
    log: [...found.log.filter((e) => e.at !== entry.at), entry],
  })
}

export const factsOf = async (ctx: QueryCtx, found: Doc<"automationRuns">) => {
  const settings = await ctx.db
    .query("calendarSettings")
    .withIndex("by_userId", (q) => q.eq("userId", found.userId))
    .unique()
  const zone = settings?.timeZone
  const date = (ms: number, time = false, where = zone) =>
    new Intl.DateTimeFormat("en-US", {
      timeZone: where,
      weekday: "short",
      month: "short",
      day: "numeric",
      ...(time && { hour: "numeric", minute: "2-digit", timeZoneName: "short" }),
    }).format(ms)
  const values: Record<string, string> = {
    "workflow.name": found.name,
    "run.date": date(Date.now()),
  }
  const context = found.context ?? {}
  const application = context.applicationId
    ? await ctx.db.get("applications", context.applicationId)
    : null
  if (application?.userId === found.userId) {
    values["application.company"] = application.company
    values["application.role"] = application.role
    values["application.status"] = statusLabels[application.status]
    const goal = application.goalId && (await ctx.db.get("goals", application.goalId))
    if (goal) values["application.goal"] = goal.name
  }
  if (context.from) values["status.from"] = statusLabels[context.from]
  if (context.to) values["status.to"] = statusLabels[context.to]
  if (context.goalId) {
    const goal = await ctx.db.get("goals", context.goalId)
    if (goal?.userId === found.userId) values["goal.name"] = goal.name
  }
  if (context.mailEventId) {
    const mail = await ctx.db.get("mailEvents", context.mailEventId)
    const k = await keys().catch(() => null)
    const note =
      mail?.userId === found.userId && k
        ? await openJson(k, mail.note, aad.email(found.userId), MailNote)
        : null
    if (note) {
      values["email.subject"] = note.subject
      values["email.from"] = note.from
    }
    if (mail) values["email.kind"] = mail.kind
  }
  if (context.loopRunId) {
    const loopRun = await ctx.db.get("loopRuns", context.loopRunId)
    if (loopRun?.userId === found.userId) {
      values["loop.name"] = loopRun.loopName
      values["roles.judged"] = String(loopRun.scanned)
      values["roles.fits"] = String(loopRun.kept)
    }
  }
  if (context.bookingId) {
    const booking = await ctx.db.get("calendarEvents", context.bookingId)
    if (booking?.userId === found.userId) {
      values["booking.title"] = booking.title
      values["booking.when"] = date(Date.parse(booking.start), true, zone ?? booking.timeZone)
    }
  }
  return {
    values,
    date,
    zone,
    application: application?.userId === found.userId ? application : null,
  }
}

export const applicationFor = async (
  ctx: MutationCtx,
  found: Doc<"automationRuns">,
  picked: Id<"applications"> | undefined
) => {
  const id = picked ?? found.context?.applicationId
  if (!id) throw new ConvexError("This run isn't about an application, so there was none to use.")
  const application = await ctx.db.get("applications", id)
  if (application?.userId !== found.userId || application.trashedAt !== undefined)
    throw new ConvexError("That application is gone.")
  return application
}

export const doBlock = async (
  ctx: MutationCtx,
  found: Doc<"automationRuns">,
  at: string,
  block: Block
): Promise<{
  output: string
  waitMs: number
  email?: boolean
  loopRunId?: Id<"loopRuns">
  stop?: boolean
}> => {
  const { values, date, zone } = await factsOf(ctx, found)
  switch (block.kind) {
    case "notify": {
      const send = block.send ?? "inbox"
      if (send !== "email")
        await ctx.runMutation(components.notifications.lib.notify, {
          owner: found.userId,
          kind: "automation.notify",
          ref: `${found._id}#${at}`,
        })
      return { output: fill(block.message, values), waitMs: 0, email: send !== "inbox" }
    }
    case "addNote": {
      const application = await applicationFor(ctx, found, block.applicationId)
      const text = fill(block.text, {
        ...values,
        "application.company": application.company,
        "application.role": application.role,
        "application.status": statusLabels[application.status],
      })
      await ctx.db.patch("applications", application._id, {
        notes: [...(application.notes ?? []), { text, at: Date.now() }].slice(
          -applicationLimits.notes
        ),
      })
      return {
        output: `Added to ${application.role} at ${application.company}: ${text}`,
        waitMs: 0,
      }
    }
    case "move": {
      const application = await applicationFor(ctx, found, block.applicationId)
      await changeStatus(ctx, application, block.to, `Moved by the workflow “${found.name}”`, {
        quiet: true,
      })
      return {
        output: `Moved ${application.role} at ${application.company} to ${statusLabels[block.to]}`,
        waitMs: 0,
      }
    }
    case "putOnGoal": {
      const application = await applicationFor(ctx, found, block.applicationId)
      const goal = await ctx.db.get("goals", block.goalId)
      if (goal?.userId !== found.userId) throw new ConvexError("That goal is gone.")
      await ctx.db.patch("applications", application._id, { goalId: goal._id })
      return {
        output: `Put ${application.role} at ${application.company} on ${goal.name}`,
        waitMs: 0,
      }
    }
    case "addEvent": {
      const where = zone ?? "UTC"
      const [y, m, d] = wallOf(Date.now(), where).date.split("-").map(Number) as [
        number,
        number,
        number,
      ]
      const [h, min] = block.at.split(":").map(Number) as [number, number]
      const start = fromWall(Date.UTC(y, m - 1, d + block.inDays, h, min), where)
      const title = fill(block.title, values).slice(0, 200)
      await ctx.db.insert("calendarEvents", {
        userId: found.userId,
        key: `workflow:${found._id}:${at}`,
        title,
        start: instantOf(start),
        end: instantOf(start + block.minutes * 60_000),
        allDay: false,
        kind: kindOf(title),
        timeZone: where,
        ...(found.context?.applicationId && { applicationId: found.context.applicationId }),
      })
      return { output: `On your calendar: ${title}, ${date(start, true)}`, waitMs: 0 }
    }
    case "findRoles": {
      const loop = await ctx.db.get("loops", block.loopId)
      if (loop?.userId !== found.userId) throw new ConvexError("That loop is gone.")
      const last = await lastRunOf(ctx, loop._id)
      if (last && (last.status === "queued" || last.status === "running"))
        throw new ConvexError(`“${loop.name}” is already running.`)
      const { ok } = await rates.limit(ctx, "automationFind", { key: found.userId })
      if (!ok) throw new ConvexError("Workflows found roles 5 times today. Try again tomorrow.")
      const loopRunId = await insertLoopRun(ctx, loop)
      await ctx.db.patch("automationRuns", found._id, {
        context: { ...found.context, loopRunId },
      })
      return { output: `Looking for roles with “${loop.name}”`, waitMs: 0, loopRunId }
    }
    case "sendEmail": {
      const to = fill(block.to, values).trim()
      if (!emailAddress.test(to))
        throw new ConvexError(`“${to.slice(0, 80)}” isn't one email address.`)
      const { ok } = await rates.limit(ctx, "automationEmail", { key: found.userId })
      if (!ok) throw new ConvexError("Workflows sent 20 emails today. Try again tomorrow.")
      return { output: `To ${to}: ${fill(block.subject, values)}`, waitMs: 0, email: true }
    }
    case "onlyIf": {
      const actual = values[block.fact]
      const went = holds(block, actual)
      const was = actual === undefined ? "isn't known" : `is “${actual}”`
      return {
        output: went ? `Went on: {${block.fact}} ${was}` : `Stopped here: {${block.fact}} ${was}`,
        waitMs: 0,
        ...(!went && { stop: true }),
      }
    }
    case "wait": {
      const waitMs = block.minutes * 60_000
      return { output: `Until ${date(Date.now() + waitMs, true)}`, waitMs }
    }
  }
}

export const matches = (trigger: Trigger, event: typeof vAutomationEvent.type) =>
  (trigger.kind === "mail" &&
    event.kind === "mail" &&
    (!trigger.kinds.length || trigger.kinds.includes(event.mailKind))) ||
  (trigger.kind === "status" &&
    event.kind === "status" &&
    (!trigger.to.length || trigger.to.includes(event.to))) ||
  (trigger.kind === "booking" && event.kind === "booking") ||
  (trigger.kind === "goal" &&
    event.kind === "goal" &&
    (!trigger.goals.length || trigger.goals.includes(event.goalId)))

export const cancelRun = async (ctx: MutationCtx, found: Doc<"automationRuns">) => {
  if (found.status !== "running") return
  const loopRun =
    found.context?.loopRunId && (await ctx.db.get("loopRuns", found.context.loopRunId))
  if (loopRun && (loopRun.status === "queued" || loopRun.status === "running"))
    await stopRunNow(ctx, loopRun)
  // Marked first: canceling calls `ended` straight away, which leaves a stopped run be.
  const finishedAt = Date.now()
  await patchRun(ctx, found, {
    status: "canceled",
    finishedAt,
    error: "Stopped.",
    log: found.log.map((e) =>
      e.status === "running" || e.status === "waiting"
        ? { ...e, status: "failed" as const, finishedAt, error: "Stopped." }
        : e
    ),
  })
  // A workflow that already ended (its completion handler failed, say) can't be canceled,
  // and trying would throw; nor can one already cleaned up, which the component no longer
  // knows. The run only needs marking.
  if (found.workflowId) {
    const id = found.workflowId as WorkflowId
    const status = await workflow.status(ctx, id).catch(() => null)
    if (status?.type === "inProgress") await workflow.cancel(ctx, id)
  }
}
