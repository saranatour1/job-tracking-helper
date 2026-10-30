import { type } from "arktype"
import { defineTable } from "convex/server"
import { arkId, arkOutputToConvex } from "../../lib/ark"
import { priorities } from "../applications/validators"

// Dates are YYYY-MM-DD, as a date input gives them, so they compare as text.
const day = type(/^\d{4}-\d{2}-\d{2}$/)

export const Milestone = type({
  name: type("string.trim").to("0 < string <= 120"),
  done: "boolean",
  "target?": day,
})

// What someone sets on a goal. Shared with the tracker's goal form.
export const GoalFields = type({
  name: type("string.trim").to("0 < string <= 80"),
  summary: type("string.trim").to("string <= 300"),
  priority: type.enumerated(...priorities),
  start: day,
  target: day,
  milestones: Milestone.array().atMostLength(20),
})

// One row per goal, owned by one person. Applications point at a goal by `goalId`. A goal
// may name one of the person's loops: roles added to the board from it join the goal.
export const goalsTable = defineTable(
  arkOutputToConvex(GoalFields.and({ userId: arkId("users"), "loopId?": arkId("loops") }))
).index("by_userId", ["userId"])
