import { v, type Infer } from "convex/values"
import { statuses } from "../applications/validators"
import { fromWall, wallOf } from "../booking/slots"
import { kinds as mailKinds } from "../email/match"

// A workflow someone builds is data, never code: a trigger and a list of steps, each one
// a block the app knows how to run. Steps can branch one level deep: a split runs all of
// its paths, Ask Jev runs the one path it picks, and a path holds blocks. Safe to import
// from the frontend.

const vStatus = v.union(...statuses.map((s) => v.literal(s)))
const vMailKind = v.union(...mailKinds.map((k) => v.literal(k)))

const blocks = [
  // Puts a line in the Inbox, or emails you, or both.
  v.object({
    kind: v.literal("notify"),
    message: v.string(),
    send: v.optional(v.union(v.literal("inbox"), v.literal("email"), v.literal("both"))),
  }),
  // Adds a note to an application: the one picked, or else the one the trigger is about.
  v.object({
    kind: v.literal("addNote"),
    applicationId: v.optional(v.id("applications")),
    text: v.string(),
  }),
  // Moves an application to another status, the same way.
  v.object({
    kind: v.literal("move"),
    applicationId: v.optional(v.id("applications")),
    to: vStatus,
  }),
  // Puts an application on one of your goals, the same way.
  v.object({
    kind: v.literal("putOnGoal"),
    applicationId: v.optional(v.id("applications")),
    goalId: v.id("goals"),
  }),
  // Puts an event on your Calendar, some days from the run at a time of day.
  v.object({
    kind: v.literal("addEvent"),
    title: v.string(),
    inDays: v.number(),
    at: v.string(),
    minutes: v.number(),
  }),
  // Runs one of your loops now: a search, Jev's judgments, and fits on your shortlist.
  v.object({ kind: v.literal("findRoles"), loopId: v.id("loops") }),
  // Emails someone from your Cloudflare address, like the person who wrote to you.
  v.object({ kind: v.literal("sendEmail"), to: v.string(), subject: v.string(), text: v.string() }),
  // Waits before the next step; free while it waits.
  v.object({ kind: v.literal("wait"), minutes: v.number() }),
  v.object({
    kind: v.literal("onlyIf"),
    fact: v.string(),
    test: v.union(
      v.literal("set"),
      v.literal("notSet"),
      v.literal("is"),
      v.literal("isNot"),
      v.literal("atLeast")
    ),
    value: v.string(),
  }),
] as const
export const vBlock = v.union(...blocks)
export type Block = Infer<typeof vBlock>

const vPaths = v.array(v.object({ label: v.string(), steps: v.array(vBlock) }))

export const vStep = v.union(
  ...blocks,
  // Runs its paths side by side, and goes on once every path is done.
  v.object({ kind: v.literal("parallel"), paths: vPaths }),
  // Jev answers `question` with one of the paths' labels, and that path runs. `id` stays
  // with the step when it moves, so its answer counts do too; older steps have none.
  v.object({
    kind: v.literal("decide"),
    id: v.optional(v.string()),
    question: v.string(),
    paths: vPaths,
  })
)
export type Step = Infer<typeof vStep>
export type StepKind = Step["kind"]
export type Branch = Extract<Step, { kind: "parallel" | "decide" }>
export const isBranch = (step: Step | undefined): step is Branch =>
  step?.kind === "parallel" || step?.kind === "decide"

/**
 * A step's place in the tree, as runs record it: "2" is the third step, and "2.1.0" is
 * the first step on the second path of that branch.
 */
export const stepAt = (steps: Step[], at: string): Step | undefined => {
  const [i, path, j] = at.split(".").map(Number)
  const step = steps[i!]
  if (path === undefined) return step
  return isBranch(step) ? step.paths[path]?.steps[j!] : undefined
}

export const vTrigger = v.union(
  // Only when you press Run now.
  v.object({ kind: v.literal("manual") }),
  // At a time of day, on some weekdays (0 = Sunday), in a zone.
  v.object({
    kind: v.literal("schedule"),
    at: v.string(),
    days: v.array(v.number()),
    timeZone: v.string(),
  }),
  // When an email is sorted, of these kinds (none picked: any kind).
  v.object({ kind: v.literal("mail"), kinds: v.array(vMailKind) }),
  // When an application moves, to these statuses (none picked: any).
  v.object({ kind: v.literal("status"), to: v.array(vStatus) }),
  // When someone books time on one of your booking pages.
  v.object({ kind: v.literal("booking") }),
  // When an application is put on a goal, one of these (none picked: any).
  v.object({ kind: v.literal("goal"), goals: v.array(v.id("goals")) })
)
export type Trigger = Infer<typeof vTrigger>

/** Triggers that come with an application, so steps can act on "the one it's about". */
export const triggerHasApplication = (trigger: Trigger) =>
  trigger.kind === "mail" ||
  trigger.kind === "status" ||
  trigger.kind === "booking" ||
  trigger.kind === "goal"

// What a run started by an event points at. Only ids: the email's words stay sealed and
// are opened when a step needs them.
export const vRunContext = v.object({
  applicationId: v.optional(v.id("applications")),
  mailEventId: v.optional(v.id("mailEvents")),
  bookingId: v.optional(v.id("calendarEvents")),
  from: v.optional(vStatus),
  to: v.optional(vStatus),
  goalId: v.optional(v.id("goals")),
  // Set by Find roles, for the steps after it.
  loopRunId: v.optional(v.id("loopRuns")),
})
export type RunContext = Infer<typeof vRunContext>

export const limits = {
  automations: 30,
  // Blocks in all, counting those on paths.
  steps: 20,
  paths: 4,
  label: 30,
  name: 80,
  message: 500,
  note: 2000,
  question: 300,
  title: 120,
  subject: 200,
  emailText: 5000,
  // A wait is at most 30 days.
  waitMinutes: 30 * 24 * 60,
  // A calendar event is 5 minutes to 8 hours, up to 60 days ahead.
  eventMinutes: 480,
  eventDays: 60,
} as const

const isZone = (zone: string) => {
  try {
    new Intl.DateTimeFormat("en", { timeZone: zone })
    return true
  } catch {
    return false
  }
}

const time = /^([01]\d|2[0-3]):[0-5]\d$/

export const onlyIfFacts = [
  "application.company",
  "application.role",
  "application.status",
  "application.goal",
  "status.from",
  "status.to",
  "goal.name",
  "email.subject",
  "email.from",
  "email.kind",
  "booking.title",
  "loop.name",
  "roles.judged",
  "roles.fits",
] as const

export type OnlyIf = Extract<Block, { kind: "onlyIf" }>

export const onlyIfMatched: OnlyIf = {
  kind: "onlyIf",
  fact: "application.company",
  test: "set",
  value: "",
}
export const onlyIfStillAt = (statusLabel: string): OnlyIf => ({
  kind: "onlyIf",
  fact: "application.status",
  test: "is",
  value: statusLabel,
})

export const holds = ({ test, value }: Pick<OnlyIf, "test" | "value">, actual?: string) => {
  const matchesIgnoringCase = (actual ?? "").trim().toLowerCase() === value.trim().toLowerCase()
  switch (test) {
    case "set":
      return Boolean(actual?.trim())
    case "notSet":
      return !actual?.trim()
    case "is":
      return matchesIgnoringCase
    case "isNot":
      return !matchesIgnoringCase
    case "atLeast":
      return actual !== undefined && Number(actual) >= Number(value)
  }
}

// One plain address: no names, no lists. Checked again once placeholders are filled.
export const emailAddress = /^[^\s@<>,;"]+@[^\s@<>,;"]+\.[^\s@<>,;"]+$/

const blockProblem = (step: Block, trigger: Trigger) => {
  if (step.kind === "notify" && (!step.message.trim() || step.message.length > limits.message))
    return `A message is 1 to ${limits.message} characters.`
  if (step.kind === "addNote" && (!step.text.trim() || step.text.length > limits.note))
    return `A note is 1 to ${limits.note} characters.`
  if (
    (step.kind === "addNote" || step.kind === "move" || step.kind === "putOnGoal") &&
    !step.applicationId &&
    !triggerHasApplication(trigger)
  )
    return "Pick an application, or start the workflow from an email, a status change, a booking or a goal."
  if (step.kind === "putOnGoal" && !step.goalId) return "Pick a goal to put it on."
  if (step.kind === "findRoles" && !step.loopId) return "Pick a loop to find roles with."
  if (step.kind === "onlyIf") {
    if (!(onlyIfFacts as readonly string[]).includes(step.fact)) return "Pick what to check."
    if ((step.test === "is" || step.test === "isNot") && !step.value.trim())
      return "Say what it should be."
    if (step.test === "atLeast" && !Number.isFinite(Number(step.value || "x")))
      return "“At least” needs a number."
    if (step.value.length > limits.label * 4) return "Keep what it checks short."
  }
  if (step.kind === "sendEmail") {
    if (!step.to.trim() || (!step.to.includes("{") && !emailAddress.test(step.to.trim())))
      return "Send it to one email address, or a placeholder like {email.from}."
    if (!step.subject.trim() || step.subject.length > limits.subject)
      return `A subject is 1 to ${limits.subject} characters.`
    if (!step.text.trim() || step.text.length > limits.emailText)
      return `An email is 1 to ${limits.emailText} characters.`
  }
  if (step.kind === "addEvent") {
    if (!step.title.trim() || step.title.length > limits.title)
      return `An event title is 1 to ${limits.title} characters.`
    if (!Number.isInteger(step.inDays) || step.inDays < 0 || step.inDays > limits.eventDays)
      return `An event is 0 to ${limits.eventDays} days after the run.`
    if (!time.test(step.at)) return "Pick a time like 09:00."
    if (!Number.isInteger(step.minutes) || step.minutes < 5 || step.minutes > limits.eventMinutes)
      return "An event lasts 5 minutes to 8 hours."
  }
  if (
    step.kind === "wait" &&
    (!Number.isInteger(step.minutes) || step.minutes < 1 || step.minutes > limits.waitMinutes)
  )
    return "A wait is a whole number of minutes, up to 30 days."
  return undefined
}

/** What's wrong with a workflow as written, or undefined when it can run. */
export const problemOf = (name: string, trigger: Trigger, steps: Step[]) => {
  if (!name.trim() || name.length > limits.name) return "Give it a name of up to 80 characters."
  if (!steps.length) return "Add at least one step."
  if (blocksOf(steps).length > limits.steps) return `A workflow has at most ${limits.steps} steps.`
  if (trigger.kind === "schedule") {
    if (!time.test(trigger.at)) return "Pick a time like 09:00."
    if (!trigger.days.length || trigger.days.some((d) => !Number.isInteger(d) || d < 0 || d > 6))
      return "Pick at least one day."
    if (!isZone(trigger.timeZone)) return "That isn't a time zone."
  }
  for (const step of steps) {
    if (!isBranch(step)) {
      const problem = blockProblem(step, trigger)
      if (problem) return problem
      continue
    }
    const what = step.kind === "decide" ? "Ask Jev" : "A split"
    if (step.kind === "decide" && (!step.question.trim() || step.question.length > limits.question))
      return `Ask Jev a question of up to ${limits.question} characters.`
    if (step.paths.length < 2 || step.paths.length > limits.paths)
      return `${what} has 2 to ${limits.paths} paths.`
    if (step.kind === "decide" && step.id !== undefined && !/^[\w-]{1,40}$/.test(step.id))
      return "That Ask Jev step's id isn't one the app made."
    const labels = step.paths.map((p) => p.label.trim().toLowerCase())
    if (step.kind === "decide" && new Set(labels).size !== labels.length)
      return "Give each of Jev's answers a different name."
    for (const path of step.paths) {
      if (!path.label.trim() || path.label.length > limits.label)
        return `Name each path, up to ${limits.label} characters.`
      if (!path.steps.length && step.kind === "parallel")
        return "Each path of a split needs at least one step."
      for (const block of path.steps) {
        const problem = blockProblem(block, trigger)
        if (problem) return problem
      }
    }
  }
  return undefined
}

/** Every block, on paths too, for checks that look at each one. */
export const blocksOf = (steps: Step[]): Block[] =>
  steps.flatMap((s) => (isBranch(s) ? s.paths.flatMap((p) => p.steps) : [s]))

/**
 * Fills placeholders like {application.company} from `values`. Plain text replacement:
 * a name it doesn't know is left as written, and nothing in the text is ever run.
 */
export const fill = (text: string, values: Record<string, string>) =>
  text.replace(/\{([a-z]+\.[a-z]+)\}/g, (match, name: string) => values[name] ?? match)

/** The next time a schedule fires after `now`. */
export const nextScheduledAt = (now: number, trigger: Extract<Trigger, { kind: "schedule" }>) => {
  const [hours, minutes] = trigger.at.split(":").map(Number) as [number, number]
  for (let days = 0; days <= 8; days++) {
    const [y, m, d] = wallOf(now + days * 86_400_000, trigger.timeZone)
      .date.split("-")
      .map(Number) as [number, number, number]
    const at = fromWall(Date.UTC(y, m - 1, d, hours, minutes), trigger.timeZone)
    if (at > now && trigger.days.includes(wallOf(at, trigger.timeZone).weekday)) return at
  }
  throw new Error(`No next run for ${trigger.at} in ${trigger.timeZone}`)
}

export const runStatuses = ["running", "done", "failed", "canceled"] as const

export const stepStatuses = ["running", "waiting", "done", "failed"] as const

// What happened at one step, for the run's history. `at` is its place, like "2.1.0"
// (see stepAt); `output` is what it said or did.
export const vLogEntry = v.object({
  at: v.string(),
  kind: v.string(),
  status: v.union(...stepStatuses.map((s) => v.literal(s))),
  startedAt: v.number(),
  finishedAt: v.optional(v.number()),
  output: v.optional(v.string()),
  error: v.optional(v.string()),
  // Ask Jev: the answer Jev picked, which is the path that ran.
  choice: v.optional(v.string()),
})

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

export const vDraft = v.object({
  name: v.string(),
  trigger: vTrigger,
  steps: v.array(vStep),
  active: v.boolean(),
})

export type Draft = Infer<typeof vDraft>

export const vRunPathArgs = {
  runId: v.id("automationRuns"),
  split: v.number(),
  path: v.number(),
  length: v.number(),
}

export const vRunShape = v.array(
  v.union(
    v.null(),
    v.object({
      kind: v.union(v.literal("parallel"), v.literal("decide")),
      lengths: v.array(v.number()),
    })
  )
)

export const vStepOutcome = v.object({
  waitMs: v.number(),
  error: v.optional(v.string()),
  email: v.optional(v.boolean()),
  loopRunId: v.optional(v.id("loopRuns")),
  stop: v.optional(v.boolean()),
})

export const vStartBranchArgs = {
  runId: v.id("automationRuns"),
  at: v.string(),
  kind: v.union(v.literal("parallel"), v.literal("decide")),
}

export const vDecision = v.union(
  v.null(),
  v.object({
    question: v.string(),
    answers: v.array(v.string()),
    facts: v.record(v.string(), v.string()),
  })
)

export const vAnsweredArgs = {
  runId: v.id("automationRuns"),
  at: v.string(),
  choice: v.optional(v.string()),
  error: v.optional(v.string()),
}

export const vFoundRolesArgs = {
  runId: v.id("automationRuns"),
  at: v.string(),
  loopRunId: v.id("loopRuns"),
  error: v.optional(v.string()),
}

export const vEmailToSend = v.union(
  v.null(),
  v.object({
    userId: v.id("users"),
    to: v.optional(v.string()),
    subject: v.string(),
    text: v.string(),
    // What the email is about, so a reply comes back to it and it joins its activity.
    application: v.optional(v.object({ id: v.id("applications"), number: v.number() })),
  })
)

export const vRunCounts = v.object({
  running: v.number(),
  done: v.number(),
  failed: v.number(),
  canceled: v.number(),
})

export const vSaveWorkflow = {
  id: v.optional(v.id("automations")),
  name: v.string(),
  trigger: vTrigger,
  steps: v.array(vStep),
  active: v.boolean(),
}
