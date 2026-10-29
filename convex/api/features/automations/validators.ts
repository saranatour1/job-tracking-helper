import { v, type Infer } from "convex/values"
import { fromWall, wallOf } from "../booking/slots"

// A workflow someone builds is data, never code: a trigger and a list of steps, each one
// a block the app knows how to run. Steps can split into paths one level deep: a split
// holds paths, and a path holds blocks. Safe to import from the frontend.

const blocks = [
  // Puts a line in the Inbox.
  v.object({ kind: v.literal("notify"), message: v.string() }),
  // Adds a note to one application.
  v.object({ kind: v.literal("addNote"), applicationId: v.id("applications"), text: v.string() }),
  // Waits before the next step; free while it waits.
  v.object({ kind: v.literal("wait"), minutes: v.number() }),
] as const
export const vBlock = v.union(...blocks)
export type Block = Infer<typeof vBlock>

export const vStep = v.union(
  ...blocks,
  // Runs its paths side by side, and goes on once every path is done.
  v.object({
    kind: v.literal("parallel"),
    paths: v.array(v.object({ label: v.string(), steps: v.array(vBlock) })),
  })
)
export type Step = Infer<typeof vStep>
export type StepKind = Step["kind"]

/**
 * A step's place in the tree, as runs record it: "2" is the third step, and "2.1.0" is
 * the first step on the second path of that split.
 */
export const stepAt = (steps: Step[], at: string): Step | undefined => {
  const [i, path, j] = at.split(".").map(Number)
  const step = steps[i!]
  if (path === undefined) return step
  return step?.kind === "parallel" ? step.paths[path]?.steps[j!] : undefined
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
  })
)
export type Trigger = Infer<typeof vTrigger>

export const limits = {
  automations: 30,
  // Blocks in all, counting those on paths.
  steps: 20,
  paths: 4,
  label: 30,
  name: 80,
  message: 500,
  note: 2000,
  // A wait is at most 30 days.
  waitMinutes: 30 * 24 * 60,
} as const

const isZone = (zone: string) => {
  try {
    new Intl.DateTimeFormat("en", { timeZone: zone })
    return true
  } catch {
    return false
  }
}

const blockProblem = (step: Block) => {
  if (step.kind === "notify" && (!step.message.trim() || step.message.length > limits.message))
    return `A message is 1 to ${limits.message} characters.`
  if (step.kind === "addNote" && (!step.text.trim() || step.text.length > limits.note))
    return `A note is 1 to ${limits.note} characters.`
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
  const blockCount = steps.reduce(
    (n, s) => n + (s.kind === "parallel" ? s.paths.reduce((m, p) => m + p.steps.length, 0) : 1),
    0
  )
  if (blockCount > limits.steps) return `A workflow has at most ${limits.steps} steps.`
  if (trigger.kind === "schedule") {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(trigger.at)) return "Pick a time like 09:00."
    if (!trigger.days.length || trigger.days.some((d) => !Number.isInteger(d) || d < 0 || d > 6))
      return "Pick at least one day."
    if (!isZone(trigger.timeZone)) return "That isn't a time zone."
  }
  for (const step of steps) {
    if (step.kind !== "parallel") {
      const problem = blockProblem(step)
      if (problem) return problem
      continue
    }
    if (step.paths.length < 2 || step.paths.length > limits.paths)
      return `A split has 2 to ${limits.paths} paths.`
    for (const path of step.paths) {
      if (!path.label.trim() || path.label.length > limits.label)
        return `Name each path, up to ${limits.label} characters.`
      if (!path.steps.length) return "Each path needs at least one step."
      for (const block of path.steps) {
        const problem = blockProblem(block)
        if (problem) return problem
      }
    }
  }
  return undefined
}

/** Every block, on paths too, for checks that look at each one. */
export const blocksOf = (steps: Step[]): Block[] =>
  steps.flatMap((s) => (s.kind === "parallel" ? s.paths.flatMap((p) => p.steps) : [s]))

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
