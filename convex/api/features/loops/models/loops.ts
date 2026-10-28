import { defineTable } from "convex/server"
import { type } from "arktype"
import { arkId, arkOutputToConvex } from "../../../../lib/ark"
import { LoopAnswers } from "../validators"

// A person's saved search. `nextRunAt` is when the cron should next start it.
export const Loop = type({
  userId: arkId("users"),
  name: "string",
  template: "string",
  answers: LoopAnswers,
  daily: "number",
  at: "string",
  timeZone: "string",
  active: "boolean",
  nextRunAt: "number",
})

export const loopsTable = defineTable(arkOutputToConvex(Loop))
  .index("by_userId", ["userId"])
  .index("by_active_and_nextRunAt", ["active", "nextRunAt"])
