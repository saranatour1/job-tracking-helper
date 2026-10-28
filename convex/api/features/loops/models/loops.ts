import { defineTable } from "convex/server"
import { type } from "arktype"
import { arkId, arkOutputToConvex } from "../../../../lib/ark"
import { LoopAnswers } from "../validators"

// A person's saved search. `nextRunAt` is when the cron should next start it; `active`
// false means it runs only when the person presses Run now.
export const Loop = type({
  userId: arkId("users"),
  name: "string",
  template: "string",
  // `digest` is optional so loops saved before that question was dropped stay valid.
  answers: LoopAnswers.and({ "digest?": "boolean" }),
  // The person's own words for the job they want; Jev judges each role against it.
  "prompt?": "string",
  daily: "number",
  // How many fits it puts on the shortlist at a time; loops from before it show 5.
  "show?": "number",
  at: "string",
  timeZone: "string",
  active: "boolean",
  nextRunAt: "number",
})

export const loopsTable = defineTable(arkOutputToConvex(Loop))
  .index("by_userId", ["userId"])
  .index("by_active_and_nextRunAt", ["active", "nextRunAt"])
