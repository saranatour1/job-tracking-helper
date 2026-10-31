import { type } from "arktype"
import { arkId } from "../../lib/ark"

export const ActivityEvent = type({
  userId: arkId("users"),
  work: "string",
  at: "number",
  failed: "boolean",
  outcome: "string",
  "summary?": "string",
  "error?": "string",
  "durationMs?": "number",
  "applicationId?": arkId("applications"),
  "prefillId?": arkId("prefills"),
  "automationId?": arkId("automations"),
})
export type ActivityEvent = typeof ActivityEvent.infer
