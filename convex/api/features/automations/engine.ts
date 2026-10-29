import {
  vResultValidator,
  vWorkflowId,
  type WorkflowCtx,
  type WorkflowId,
} from "@convex-dev/workflow"
import { ConvexError, type Infer, v } from "convex/values"
import { components, internal } from "../../../_generated/api"
import type { Doc, Id } from "../../../_generated/dataModel"
import {
  internalMutation,
  internalQuery,
  type MutationCtx,
  type QueryCtx,
} from "../../../_generated/server"
import { changeStatus } from "../applications/public"
import { limits as applicationLimits, statusLabels } from "../applications/validators"
import { fromWall, instantOf, wallOf } from "../booking/slots"
import { kindOf } from "../calendar/public"
import { aad, keys, openJson } from "../email/internal"
import { MailNote } from "../email/models"
import { insertLoopRun, stopRunNow } from "../loops/internal"
import { lastRunOf } from "../loops/public"
import { limits as rates, workflow } from "../workflows/manager"
import { deleteRuns, insertRun, patchRun, recordChoice } from "./counts"
import { vAutomationEvent } from "./fire"
import type { vLogEntry } from "./models"
import {
  type Block,
  emailAddress,
  fill,
  isBranch,
  limits,
  nextScheduledAt,
  type RunContext,
  stepAt,
  type Trigger,
} from "./validators"

type LogEntry = Infer<typeof vLogEntry>

// Runs one block; returns why it couldn't run, if it couldn't. A wait sleeps inside
// whichever workflow called it, so it costs nothing while it waits; an email goes out
// from an action, since it calls Cloudflare; Find roles runs the loop's own workflow
// inside this one.
const runBlock = async (step: WorkflowCtx, runId: Id<"automationRuns">, at: string) => {
  const done = await step.runMutation(internal.automations.runStep, { runId, at })
  if (done.error) return done.error
  const { waitMs } = done
  if ("email" in done && done.email) {
    const failed = await step.runAction(internal.automations.sendMail, { runId, at })
    if (failed) return failed
  }
  if ("loopRunId" in done && done.loopRunId) {
    const loopRunId = done.loopRunId
    const error = await step
      .runWorkflow(internal.workflows.findJobs, { runId: loopRunId })
      .then(() => undefined)
      .catch((cause: unknown) => (cause instanceof Error ? cause.message : "it failed"))
    const failed = await step.runMutation(internal.automations.foundRoles, {
      runId,
      at,
      loopRunId,
      error,
    })
    if (failed) return failed
  }
  if (waitMs > 0) {
    await step.sleep(waitMs, { name: `wait ${at}` })
    await step.runMutation(internal.automations.finishStep, { runId, at })
  }
  return null
}

// One interpreter runs every workflow anyone builds. It walks the run's copy of the
// steps: a block is one mutation; a split starts each path as its own child workflow and
// goes on once every path is done; Ask Jev asks, then runs the one path Jev picked. A
// step that can't run records why, and the run stops there.
const run = workflow.define({
  args: { runId: v.id("automationRuns") },
  handler: async (step, { runId }): Promise<void> => {
    const shape = await step.runQuery(internal.automations.shapeOf, { runId })
    for (const [i, branch] of shape.entries()) {
      const at = String(i)
      if (branch === null) {
        const error = await runBlock(step, runId, at)
        if (error) throw new Error(error)
        continue
      }
      await step.runMutation(internal.automations.startBranch, { runId, at, kind: branch.kind })
      if (branch.kind === "decide") {
        const { path, error } = await step.runAction(internal.automations.askJev, { runId, at })
        if (error || path === null) throw new Error(error ?? "Jev didn't answer.")
        for (let j = 0; j < (branch.lengths[path] ?? 0); j++) {
          const failed = await runBlock(step, runId, `${i}.${path}.${j}`)
          if (failed) throw new Error(failed)
        }
      } else {
        // Each path has its own journal, so a wait on one never holds back the others (in
        // one workflow, steps started together advance together). A path that fails stops
        // there and says why; the others still finish first.
        const errors = await Promise.all(
          branch.lengths.map((length, path) =>
            step.runWorkflow(internal.automations.runPath, { runId, split: i, path, length })
          )
        )
        const error = errors.find((e) => e !== null)
        if (error) throw new Error(error)
      }
      await step.runMutation(internal.automations.finishStep, { runId, at })
    }
  },
})

/** One path of a split: its blocks in order. Returns why it stopped early, or null. */
const runPath = workflow.define({
  args: {
    runId: v.id("automationRuns"),
    split: v.number(),
    path: v.number(),
    length: v.number(),
  },
  returns: v.union(v.string(), v.null()),
  handler: async (step, { runId, split, path, length }): Promise<string | null> => {
    for (let j = 0; j < length; j++) {
      const error = await runBlock(step, runId, `${split}.${path}.${j}`)
      if (error) return error
    }
    return null
  },
})

// How many runs each workflow keeps in its history.
export const keptRuns = 50

/** Starts a run of `automation` now, with its steps as they are. */
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
    internal.automations.run,
    { runId },
    { onComplete: internal.automations.ended, context: { runId } }
  )
  await ctx.db.patch("automationRuns", runId, { workflowId })
  // Keep the newest runs: the oldest finished ones go, a few at a time.
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

/** The run's steps as the interpreter needs them: null for a block, or a branch's kind
 * and each path's length. */
const shapeOf = internalQuery({
  args: { runId: v.id("automationRuns") },
  returns: v.array(
    v.union(
      v.null(),
      v.object({
        kind: v.union(v.literal("parallel"), v.literal("decide")),
        lengths: v.array(v.number()),
      })
    )
  ),
  handler: async (ctx, { runId }) =>
    ((await ctx.db.get("automationRuns", runId))?.steps ?? []).map((s) =>
      isBranch(s) ? { kind: s.kind, lengths: s.paths.map((p) => p.steps.length) } : null
    ),
})

// Reads the run again before writing, so paths running side by side never drop each
// other's entries.
const setLog = async (ctx: MutationCtx, runId: Doc<"automationRuns">["_id"], entry: LogEntry) => {
  const found = await ctx.db.get("automationRuns", runId)
  if (!found) return
  await ctx.db.patch("automationRuns", runId, {
    log: [...found.log.filter((e) => e.at !== entry.at), entry],
  })
}

// What a step's text can name, from the run and the event that started it. Only these,
// filled in as plain text. An email's words are opened here, when a step needs them, so
// they never sit unsealed in a run.
export const factsOf = async (ctx: QueryCtx, found: Doc<"automationRuns">) => {
  const settings = await ctx.db
    .query("calendarSettings")
    .withIndex("by_userId", (q) => q.eq("userId", found.userId))
    .unique()
  const zone = settings?.timeZone
  // In the Calendar's zone; without one, the zone a fact came with, or else UTC.
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
  }
  if (context.from) values["status.from"] = statusLabels[context.from]
  if (context.to) values["status.to"] = statusLabels[context.to]
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

// The application a step acts on: the one it names, or else the one the event is about.
const applicationFor = async (
  ctx: MutationCtx,
  found: Doc<"automationRuns">,
  picked: Id<"applications"> | undefined
) => {
  const id = picked ?? found.context?.applicationId
  if (!id) throw new ConvexError("This run isn't about an application, so there was none to use.")
  const application = await ctx.db.get("applications", id)
  if (application?.userId !== found.userId) throw new ConvexError("That application is gone.")
  return application
}

/** Does one block. Returns what it said or did, how long to wait after it, and whether
 * an email still has to go out. */
const doBlock = async (
  ctx: MutationCtx,
  found: Doc<"automationRuns">,
  at: string,
  block: Block
): Promise<{ output: string; waitMs: number; email?: boolean; loopRunId?: Id<"loopRuns"> }> => {
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
      // Quietly: a workflow's own move never starts workflows, so none can set off another.
      await changeStatus(ctx, application, block.to, `Moved by the workflow “${found.name}”`, {
        quiet: true,
      })
      return {
        output: `Moved ${application.role} at ${application.company} to ${statusLabels[block.to]}`,
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
      // Each search spends credits and Jev's time, so a few a day.
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
    case "wait": {
      const waitMs = block.minutes * 60_000
      return { output: `Until ${date(Date.now() + waitMs, true)}`, waitMs }
    }
  }
}

/**
 * Runs the block at `at` and records it. A block that can't run is recorded as failed
 * with its reason, which comes back so the interpreter can stop the run.
 */
const runStep = internalMutation({
  args: { runId: v.id("automationRuns"), at: v.string() },
  returns: v.object({
    waitMs: v.number(),
    error: v.optional(v.string()),
    email: v.optional(v.boolean()),
    loopRunId: v.optional(v.id("loopRuns")),
  }),
  handler: async (ctx, { runId, at }) => {
    const found = await ctx.db.get("automationRuns", runId)
    const block = found && stepAt(found.steps, at)
    if (!found || found.status !== "running" || !block || isBranch(block)) return { waitMs: 0 }
    const startedAt = Date.now()
    try {
      const { output, waitMs, email, loopRunId } = await doBlock(ctx, found, at, block)
      await setLog(ctx, runId, {
        at,
        kind: block.kind,
        startedAt,
        output,
        ...(waitMs > 0
          ? { status: "waiting" }
          : email || loopRunId
            ? { status: "running" }
            : { status: "done", finishedAt: Date.now() }),
      })
      return { waitMs, ...(email && { email }), ...(loopRunId && { loopRunId }) }
    } catch (cause) {
      if (!(cause instanceof ConvexError)) throw cause
      const error = String(cause.data)
      await setLog(ctx, runId, {
        at,
        kind: block.kind,
        startedAt,
        status: "failed",
        finishedAt: Date.now(),
        error,
      })
      return { waitMs: 0, error }
    }
  },
})

const startBranch = internalMutation({
  args: {
    runId: v.id("automationRuns"),
    at: v.string(),
    kind: v.union(v.literal("parallel"), v.literal("decide")),
  },
  returns: v.null(),
  handler: async (ctx, { runId, at, kind }) => {
    await setLog(ctx, runId, { at, kind, status: "running", startedAt: Date.now() })
    return null
  },
})

/** Marks a wait, an email or a branch done. */
const finishStep = internalMutation({
  args: { runId: v.id("automationRuns"), at: v.string() },
  returns: v.null(),
  handler: async (ctx, { runId, at }) => {
    const entry = (await ctx.db.get("automationRuns", runId))?.log.find((e) => e.at === at)
    if (entry) await setLog(ctx, runId, { ...entry, status: "done", finishedAt: Date.now() })
    return null
  },
})

// Called when a run's workflow ends, however it ends.
const ended = internalMutation({
  args: {
    workflowId: vWorkflowId,
    result: vResultValidator,
    context: v.object({ runId: v.id("automationRuns") }),
  },
  returns: v.null(),
  handler: async (ctx, { workflowId, result, context }) => {
    // The run keeps its own history, so the workflow's journal can go once it's over.
    await ctx.scheduler.runAfter(0, internal.automations.forgetWorkflow, { workflowId })
    const found = await ctx.db.get("automationRuns", context.runId)
    if (!found || found.status !== "running") return null
    const finishedAt = Date.now()
    if (result.kind === "success") {
      await patchRun(ctx, found, { status: "done", finishedAt })
      return null
    }
    const failed = found.log.find((e) => e.status === "failed")
    const error =
      result.kind === "canceled" ? "Canceled." : (failed?.error ?? "Something went wrong.")
    // Steps still going when it stopped stop with it.
    const log = found.log.map((e) =>
      e.status === "running" || e.status === "waiting"
        ? { ...e, status: "failed" as const, finishedAt, error }
        : e
    )
    await patchRun(ctx, found, {
      status: result.kind === "failed" ? "failed" : "canceled",
      finishedAt,
      error,
      log,
    })
    return null
  },
})

/** What Ask Jev needs: the question, the answers, and the facts the run knows. */
const decisionOf = internalQuery({
  args: { runId: v.id("automationRuns"), at: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      question: v.string(),
      answers: v.array(v.string()),
      facts: v.record(v.string(), v.string()),
    })
  ),
  handler: async (ctx, { runId, at }) => {
    const found = await ctx.db.get("automationRuns", runId)
    const step = found && stepAt(found.steps, at)
    if (!found || found.status !== "running" || step?.kind !== "decide") return null
    const { values } = await factsOf(ctx, found)
    return {
      question: step.question,
      answers: step.paths.map((p) => p.label),
      facts: values,
    }
  },
})

/** Records Jev's answer, or why there wasn't one, and counts it. */
const answered = internalMutation({
  args: {
    runId: v.id("automationRuns"),
    at: v.string(),
    choice: v.optional(v.string()),
    error: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, { runId, at, choice, error }) => {
    const found = await ctx.db.get("automationRuns", runId)
    const entry = found?.log.find((e) => e.at === at)
    if (!found || !entry) return null
    if (error) {
      await setLog(ctx, runId, { ...entry, status: "failed", finishedAt: Date.now(), error })
      return null
    }
    await setLog(ctx, runId, { ...entry, choice, output: `Jev answered “${choice}”` })
    if (choice) await recordChoice(ctx, found, at, choice)
    return null
  },
})

/** Records how a Find roles step's loop run went. Returns why it failed, or null. */
const foundRoles = internalMutation({
  args: {
    runId: v.id("automationRuns"),
    at: v.string(),
    loopRunId: v.id("loopRuns"),
    error: v.optional(v.string()),
  },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, { runId, at, loopRunId, error }) => {
    const entry = (await ctx.db.get("automationRuns", runId))?.log.find((e) => e.at === at)
    const loopRun = await ctx.db.get("loopRuns", loopRunId)
    const failed =
      error !== undefined
        ? `The search failed: ${error}`.slice(0, 300)
        : loopRun?.status !== "done"
          ? "The loop is gone, so there was nothing to search."
          : null
    // A run that ended early on the workflow's side ends on the loop's side too.
    if (failed && loopRun && (loopRun.status === "queued" || loopRun.status === "running"))
      await ctx.db.patch("loopRuns", loopRunId, {
        status: "failed",
        finishedAt: Date.now(),
        note: failed,
      })
    if (!entry) return failed
    await setLog(ctx, runId, {
      ...entry,
      finishedAt: Date.now(),
      ...(failed
        ? { status: "failed", error: failed }
        : {
            status: "done",
            output: `Jev judged ${loopRun!.scanned} roles: ${loopRun!.kept} fit.${
              loopRun!.note ? ` ${loopRun!.note}` : ""
            }`,
          }),
    })
    return failed
  },
})

/** What an email step says, and who it goes to: you, for Notify me, or whoever Send
 * email names. */
const emailOf = internalQuery({
  args: { runId: v.id("automationRuns"), at: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      userId: v.id("users"),
      to: v.optional(v.string()),
      subject: v.string(),
      text: v.string(),
    })
  ),
  handler: async (ctx, { runId, at }) => {
    const found = await ctx.db.get("automationRuns", runId)
    const entry = found?.log.find((e) => e.at === at)
    const block = found && stepAt(found.steps, at)
    if (!found || found.status !== "running" || !entry?.output) return null
    if (block?.kind !== "sendEmail")
      return { userId: found.userId, subject: found.name, text: entry.output }
    const { values } = await factsOf(ctx, found)
    return {
      userId: found.userId,
      to: fill(block.to, values).trim(),
      subject: fill(block.subject, values).slice(0, limits.subject),
      text: fill(block.text, values),
    }
  },
})

/** Marks an email step done, or failed with the reason. */
const emailed = internalMutation({
  args: { runId: v.id("automationRuns"), at: v.string(), error: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, { runId, at, error }) => {
    const entry = (await ctx.db.get("automationRuns", runId))?.log.find((e) => e.at === at)
    if (!entry) return null
    await setLog(ctx, runId, {
      ...entry,
      status: error ? "failed" : "done",
      finishedAt: Date.now(),
      ...(error
        ? { error }
        : entry.kind === "notify" && { output: `${entry.output} (also emailed)` }),
    })
    return null
  },
})

const matches = (trigger: Trigger, event: typeof vAutomationEvent.type) =>
  (trigger.kind === "mail" &&
    event.kind === "mail" &&
    (!trigger.kinds.length || trigger.kinds.includes(event.mailKind))) ||
  (trigger.kind === "status" &&
    event.kind === "status" &&
    (!trigger.to.length || trigger.to.includes(event.to))) ||
  (trigger.kind === "booking" && event.kind === "booking")

/** Starts the person's workflows an event matches, with what the event was about. */
const onEvent = internalMutation({
  args: { userId: v.id("users"), event: vAutomationEvent },
  returns: v.number(),
  handler: async (ctx, { userId, event }) => {
    const automations = await ctx.db
      .query("automations")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .take(30)
    let started = 0
    for (const automation of automations) {
      if (!automation.active || !matches(automation.trigger, event)) continue
      // A flood of mail can't start runs without end.
      const { ok } = await rates.limit(ctx, "automationEvent", { key: userId })
      if (!ok) break
      const { kind: _kind, ...rest } = event
      await startRun(ctx, automation, "event", {
        ...("applicationId" in rest && rest.applicationId && { applicationId: rest.applicationId }),
        ...("mailEventId" in rest && { mailEventId: rest.mailEventId }),
        ...("bookingId" in rest && { bookingId: rest.bookingId }),
        ...("from" in rest && { from: rest.from, to: rest.to }),
      })
      started++
    }
    return started
  },
})

const forgetWorkflow = internalMutation({
  args: { workflowId: vWorkflowId },
  returns: v.null(),
  handler: async (ctx, { workflowId }) => {
    await workflow.cleanup(ctx, workflowId)
    return null
  },
})

// The cron's job: start scheduled workflows that are due and set their next time.
const startDue = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const now = Date.now()
    const due = await ctx.db
      .query("automations")
      // The lower bound matters: a missing nextRunAt (every manual workflow) sorts before
      // all numbers, so without it they'd fill the batch and starve the scheduled ones.
      .withIndex("by_active_and_nextRunAt", (q) =>
        q.eq("active", true).gte("nextRunAt", 0).lte("nextRunAt", now)
      )
      .take(50)
    for (const automation of due) {
      if (automation.trigger.kind !== "schedule") continue
      await startRun(ctx, automation, "schedule")
      await ctx.db.patch("automations", automation._id, {
        nextRunAt: nextScheduledAt(now, automation.trigger),
      })
    }
    return due.length
  },
})

/** Stops a run that's still going. */
export const cancelRun = async (ctx: MutationCtx, found: Doc<"automationRuns">) => {
  if (found.status !== "running") return
  // A loop run it started stops too, with its pending judgments.
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

export const engineApi = {
  run,
  runPath,
  decisionOf,
  answered,
  foundRoles,
  emailOf,
  emailed,
  onEvent,
  startBranch,
  forgetWorkflow,
  shapeOf,
  runStep,
  finishStep,
  ended,
  startDue,
}
