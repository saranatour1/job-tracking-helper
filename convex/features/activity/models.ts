import { defineTable } from "convex/server"
import { arkOutputToConvex } from "../../lib/ark"
import { ActivityEvent } from "./validators"

export const activityEventsTable = defineTable(arkOutputToConvex(ActivityEvent))
  .index("by_userId_and_at", ["userId", "at"])
  .index("by_userId_and_failed_and_at", ["userId", "failed", "at"])
  .index("by_failed_and_at", ["failed", "at"])
  .index("by_at", ["at"])
