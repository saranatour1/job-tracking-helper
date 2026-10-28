import { defineTable } from "convex/server"
import { type } from "arktype"
import { arkId, arkOutputToConvex } from "../../../../lib/ark"
import { providerIds, runStatuses, verdicts } from "../validators"
import { Check, Judgment } from "./leads"

// A role Jev judged, waiting for the run to save it.
export const Candidate = type({
  jobId: arkId("jobs"),
  url: "string",
  urlKey: "string",
  title: "string",
  company: "string",
  location: "string",
  snippet: "string",
  verdict: type.enumerated(...verdicts),
  fit: "number",
  reasons: "string[]",
  checks: Check.array(),
  judgment: Judgment,
})

// One morning's run of a loop. The workflow component keeps the steps; this keeps
// what the Runs tab shows: `scanned` roles judged, `kept` fits saved, `credits` spent
// finding boards. `saved` and `applied` count the run's leads as people act.
export const LoopRun = type({
  loopId: arkId("loops"),
  userId: arkId("users"),
  loopName: "string",
  "workflowId?": "string",
  status: type.enumerated(...runStatuses),
  "provider?": type.enumerated(...providerIds),
  scanned: "number",
  kept: "number",
  saved: "number",
  applied: "number",
  credits: "number",
  // What Jev cost this run, in US dollars.
  "cost?": "number",
  startedAt: "number",
  "finishedAt?": "number",
  "note?": "string",
  // While Jev is judging on the batch worker: how many are left, and what it said so far.
  "readsLeft?": "number",
  // The judgments' ids on the batch worker, so stopping a run can cancel the rest.
  "readWorkIds?": "string[]",
  "candidates?": Candidate.array(),
  "readFailures?": "number",
})

export const loopRunsTable = defineTable(arkOutputToConvex(LoopRun))
  .index("by_loopId_and_startedAt", ["loopId", "startedAt"])
  .index("by_userId_and_startedAt", ["userId", "startedAt"])
