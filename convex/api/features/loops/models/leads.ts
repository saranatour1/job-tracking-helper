import { defineTable } from "convex/server"
import { type } from "arktype"
import { arkId, arkOutputToConvex } from "../../../../lib/ark"
import { leadStatuses, verdicts } from "../validators"

// Jev's answers for one role: `match` is 0 to 3 on the match levels in judge.ts, the
// others the probability of yes. Kept next to the verdict so it can be checked later.
export const Judgment = type({
  match: "number",
  "avoids?": "number",
  "inPlace?": "number",
  level: "string",
  model: "string",
})

// A role a run judged for someone. `verdict` is Jev's call and `reasons` say why in
// words; `status` is what the person did with it, and roles that aren't a fit start as
// "unfit" so they stay out of New jobs. `urlKey` is the cleaned-up URL, so a role
// someone has been shown never comes back. Leads from before Jev have no verdict.
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
  "jobId?": arkId("jobs"),
  "verdict?": type.enumerated(...verdicts),
  "judgment?": Judgment,
  "applicationId?": arkId("applications"),
})

export const jobLeadsTable = defineTable(arkOutputToConvex(JobLead))
  .index("by_userId_and_urlKey", ["userId", "urlKey"])
  .index("by_runId", ["runId"])
  .index("by_userId_and_status", ["userId", "status"])
