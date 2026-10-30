import { defineTable } from "convex/server"
import { arkOutputToConvex } from "../../../lib/ark"
import { LoopRun } from "../validators"

export const loopRunsTable = defineTable(arkOutputToConvex(LoopRun))
  .index("by_loopId_and_startedAt", ["loopId", "startedAt"])
  .index("by_userId_and_startedAt", ["userId", "startedAt"])
