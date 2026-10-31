import { defineTable } from "convex/server"
import { arkId, arkOutputToConvex } from "../../lib/ark"
import { GoalFields } from "./validators"

export const goalsTable = defineTable(
  arkOutputToConvex(GoalFields.and({ userId: arkId("users"), "loopId?": arkId("loops") }))
).index("by_userId", ["userId"])
