import { type } from "arktype"
import { priorities } from "../applications/validators"
import { arkId } from "../../lib/ark"
import { type Infer, v } from "convex/values"

export const day = type(/^\d{4}-\d{2}-\d{2}$/)

export const Milestone = type({
  name: type("string.trim").to("0 < string <= 120"),
  done: "boolean",
  "target?": day,
})

export const GoalFields = type({
  name: type("string.trim").to("0 < string <= 80"),
  summary: type("string.trim").to("string <= 300"),
  priority: type.enumerated(...priorities),
  start: day,
  target: day,
  milestones: Milestone.array().atMostLength(20),
})

export const maxGoals = 50

export const maxEvaluated = 30

export const loopField = { "loopId?": arkId("loops").or("null") }

export const vVerdicts = v.object({
  add: v.array(v.id("applications")),
  remove: v.array(v.id("applications")),
  judged: v.number(),
})

export type Verdicts = Infer<typeof vVerdicts>

export const NewGoal = GoalFields.and(loopField)

export const UpdateGoal = type({ id: arkId("goals") })
  .and(GoalFields.partial())
  .and(loopField)

export const vToEvaluate = v.union(
  v.null(),
  v.object({
    goal: v.object({ name: v.string(), summary: v.string(), milestones: v.array(v.string()) }),
    applications: v.array(
      v.object({
        id: v.id("applications"),
        company: v.string(),
        role: v.string(),
        status: v.string(),
        location: v.string(),
        labels: v.array(v.string()),
        description: v.string(),
        onGoal: v.boolean(),
      })
    ),
  })
)
