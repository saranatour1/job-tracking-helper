import { type } from "arktype"
import { arkId } from "../../lib/ark"

// One thing that happened for someone, kept from its evlog event. Mail subjects and addresses
// never go in: `summary` is written without them, and evlog masks any address in an error.
export const ActivityEvent = type({
  userId: arkId("users"),
  // What ran, like loop.run or mail.send.
  work: "string",
  at: "number",
  failed: "boolean",
  outcome: "string",
  "summary?": "string",
  // Why it failed, or what went wrong on the way.
  "error?": "string",
  "durationMs?": "number",
  "applicationId?": arkId("applications"),
  "prefillId?": arkId("prefills"),
  "automationId?": arkId("automations"),
})
export type ActivityEvent = typeof ActivityEvent.infer
