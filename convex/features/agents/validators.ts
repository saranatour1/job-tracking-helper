import { v } from "convex/values"
import { priorities } from "../applications/validators"
import { vStep, vTrigger } from "../automations/validators"
import { prefillStatuses } from "../prefilled/validators"
import { workModes } from "../preferences/validators"

const literals = <T extends string>(values: readonly T[]) =>
  v.union(...values.map((value) => v.literal(value)))

const vTags = v.array(v.string())
const vCustom = v.array(v.object({ question: v.string(), answer: v.string() }))

const vTagFields = {
  interests: vTags,
  avoid: vTags,
  skillsToBuild: vTags,
  locations: vTags,
  companies: vTags,
  redFlagCompanies: vTags,
}

const vAnswers = v.object({
  offer: v.string(),
  leave: v.string(),
  goodWeek: v.string(),
  pay: v.string(),
  visa: v.string(),
  start: v.string(),
})

const vPreferenceFields = {
  ...vTagFields,
  workMode: literals(workModes),
  growthGoal: v.string(),
  companyTraits: v.string(),
  redFlags: v.string(),
  identity: v.string(),
  custom: vCustom,
}

export const vPreferencesOut = v.object({
  ...vPreferenceFields,
  answers: vAnswers,
  hasResume: v.boolean(),
})

export const vPreferencesPatch = {
  ...v.object(vPreferenceFields).partial().fields,
  answers: v.optional(vAnswers.partial()),
}

export const vPreferencesAdd = {
  ...v.object(vTagFields).partial().fields,
  custom: v.optional(vCustom),
}

const vVerdict = v.union(v.literal("fit"), v.literal("notFit"), v.null())

export const vJobRowOut = v.object({
  id: v.string(),
  title: v.string(),
  company: v.string(),
  location: v.string(),
  remote: v.boolean(),
  postedAt: v.number(),
  url: v.string(),
  preview: v.string(),
  fit: v.union(v.number(), v.null()),
  verdict: vVerdict,
})

export const vJobOut = v.object({
  id: v.string(),
  title: v.string(),
  company: v.string(),
  location: v.string(),
  url: v.string(),
  text: v.string(),
  fit: v.union(v.number(), v.null()),
  verdict: vVerdict,
  reasons: v.array(v.string()),
  checks: v.array(v.object({ label: v.string(), kind: v.string(), result: v.string() })),
})

export const vShortlistOut = v.object({
  id: v.string(),
  title: v.string(),
  company: v.string(),
  location: v.string(),
  url: v.string(),
  fit: v.number(),
  reasons: v.array(v.string()),
  status: v.string(),
})

export const vLoopAnswers = v.object({
  usePreferences: v.boolean(),
  stretch: v.boolean(),
  remoteOnly: v.boolean(),
  nearMe: v.boolean(),
  listedCompanies: v.boolean(),
  skipRedFlags: v.boolean(),
  postedToday: v.boolean(),
})

export const vLoopOut = v.object({
  id: v.string(),
  name: v.string(),
  active: v.boolean(),
  prompt: v.string(),
  answers: vLoopAnswers,
  daily: v.number(),
  show: v.number(),
  at: v.string(),
  timeZone: v.string(),
  lastRun: v.union(
    v.null(),
    v.object({
      status: v.string(),
      startedAt: v.number(),
      scanned: v.number(),
      kept: v.number(),
      note: v.union(v.string(), v.null()),
    })
  ),
})

export const vLoopArgs = {
  id: v.optional(v.string()),
  name: v.optional(v.string()),
  prompt: v.optional(v.string()),
  answers: v.optional(vLoopAnswers.partial()),
  daily: v.optional(v.union(v.literal(25), v.literal(50), v.literal(100))),
  show: v.optional(v.union(v.literal(3), v.literal(5), v.literal(10))),
  at: v.optional(v.union(v.literal("07:00"), v.literal("08:00"), v.literal("09:00"))),
  timeZone: v.optional(v.string()),
  active: v.optional(v.boolean()),
}

export const vPrefillRowOut = v.object({
  id: v.string(),
  company: v.string(),
  title: v.string(),
  status: literals(prefillStatuses),
  unanswered: v.number(),
  appUrl: v.string(),
})

export const vPrefillOut = v.object({
  id: v.string(),
  company: v.string(),
  title: v.string(),
  status: literals(prefillStatuses),
  error: v.union(v.string(), v.null()),
  appUrl: v.string(),
  fields: v.array(
    v.object({
      question: v.string(),
      type: v.string(),
      required: v.boolean(),
      options: v.union(v.array(v.string()), v.null()),
      answer: v.union(v.string(), v.null()),
      source: v.string(),
    })
  ),
})

const vMilestone = v.object({ name: v.string(), done: v.boolean(), target: v.optional(v.string()) })

export const vGoalOut = v.object({
  id: v.string(),
  name: v.string(),
  summary: v.string(),
  priority: literals(priorities),
  start: v.string(),
  target: v.string(),
  milestones: v.array(vMilestone),
  loopId: v.union(v.string(), v.null()),
})

export const vGoalArgs = {
  id: v.optional(v.string()),
  name: v.optional(v.string()),
  summary: v.optional(v.string()),
  priority: v.optional(literals(priorities)),
  start: v.optional(v.string()),
  target: v.optional(v.string()),
  milestones: v.optional(v.array(vMilestone)),
  loopId: v.optional(v.union(v.string(), v.null())),
}

const vFilters = v.object({
  status: v.optional(vTags),
  priority: v.optional(vTags),
  label: v.optional(vTags),
  goal: v.optional(vTags),
  company: v.optional(vTags),
  method: v.optional(vTags),
})

const vDisplay = v.object({
  layout: v.optional(v.union(v.literal("board"), v.literal("list"))),
  groupBy: v.optional(v.string()),
  orderBy: v.optional(v.string()),
  showEmpty: v.optional(v.boolean()),
  shown: v.optional(vTags),
})

export const vViewOut = v.object({
  id: v.string(),
  name: v.string(),
  description: v.string(),
  filters: v.record(v.string(), vTags),
  display: v.union(vDisplay, v.null()),
})

export const vViewArgs = {
  id: v.optional(v.string()),
  name: v.optional(v.string()),
  description: v.optional(v.string()),
  filters: v.optional(vFilters),
  display: v.optional(vDisplay),
}

const vContactFields = {
  company: v.string(),
  name: v.string(),
  email: v.string(),
  title: v.string(),
  phone: v.string(),
  notes: v.string(),
}

export const vContactOut = v.object({
  ...vContactFields,
  id: v.string(),
  count: v.number(),
  lastAt: v.number(),
})

export const vContactAdded = v.object(vContactFields)

export const vContactArgs = v.object(vContactFields).partial().fields

export const vWorkflowOut = v.object({
  id: v.string(),
  name: v.string(),
  active: v.boolean(),
  // Checked when saved. Spelling out its shape again here adds to every tools/list.
  trigger: v.any(),
  stepCount: v.number(),
  appUrl: v.string(),
})

export const vWorkflowFull = v.object({ ...vWorkflowOut.fields, steps: v.array(v.any()) })

export const vWorkflowArgs = {
  id: v.optional(v.string()),
  name: v.string(),
  trigger: vTrigger,
  steps: v.array(vStep),
}
