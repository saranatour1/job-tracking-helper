import { defineTable } from "convex/server"
import { type } from "arktype"
import { arkId, arkOutputToConvex } from "../../../../lib/ark"
import { providerIds, runStatuses } from "../validators"

// A posting a read kept, waiting for the run to pick the best few.
export const Candidate = type({
  url: "string",
  urlKey: "string",
  title: "string",
  company: "string",
  snippet: "string",
  fit: "number",
  reasons: "string[]",
})

// One morning's run of a loop. The workflow component keeps the steps; this keeps
// what the Runs tab shows. `saved` and `applied` count the run's leads as people act.
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
  startedAt: "number",
  "finishedAt?": "number",
  "note?": "string",
  // While reads are out on the read pool: how many are left, and what they kept so far.
  "readsLeft?": "number",
  "candidates?": Candidate.array(),
  "readCredits?": "number",
  "readFailures?": "number",
  "outOfCredits?": "boolean",
})

export const loopRunsTable = defineTable(arkOutputToConvex(LoopRun))
  .index("by_loopId_and_startedAt", ["loopId", "startedAt"])
  .index("by_userId_and_startedAt", ["userId", "startedAt"])
