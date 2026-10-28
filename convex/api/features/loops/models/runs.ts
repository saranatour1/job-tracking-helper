import { defineTable } from "convex/server"
import { type } from "arktype"
import { arkId, arkOutputToConvex } from "../../../../lib/ark"
import { providerIds, runStatuses } from "../validators"

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
})

export const loopRunsTable = defineTable(arkOutputToConvex(LoopRun))
  .index("by_loopId_and_startedAt", ["loopId", "startedAt"])
  .index("by_userId_and_startedAt", ["userId", "startedAt"])
