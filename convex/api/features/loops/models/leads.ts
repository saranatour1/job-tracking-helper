import { defineTable } from "convex/server"
import { type } from "arktype"
import { arkId, arkOutputToConvex } from "../../../../lib/ark"
import { leadStatuses } from "../validators"

// A job a run found and kept. `urlKey` is the cleaned-up URL, so a posting someone has
// already seen never comes back.
export const JobLead = type({
  userId: arkId("users"),
  loopId: arkId("loops"),
  runId: arkId("loopRuns"),
  url: "string",
  urlKey: "string",
  title: "string",
  company: "string",
  snippet: "string",
  fit: "number",
  reasons: "string[]",
  status: type.enumerated(...leadStatuses),
  "applicationId?": arkId("applications"),
})

export const jobLeadsTable = defineTable(arkOutputToConvex(JobLead))
  .index("by_userId_and_urlKey", ["userId", "urlKey"])
  .index("by_runId", ["runId"])
  .index("by_userId_and_status", ["userId", "status"])
