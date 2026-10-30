import { defineTable } from "convex/server"
import { arkId, arkOutputToConvex } from "../../lib/ark"
import { GoalFields } from "./validators"

// One row per goal, owned by one person. Applications point at a goal by `goalId`. A goal
// may name one of the person's loops: roles added to the board from it join the goal.
export const goalsTable = defineTable(
  arkOutputToConvex(GoalFields.and({ userId: arkId("users"), "loopId?": arkId("loops") }))
).index("by_userId", ["userId"])
