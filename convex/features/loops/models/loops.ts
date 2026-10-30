import { defineTable } from "convex/server"
import { arkOutputToConvex } from "../../../lib/ark"
import { Loop } from "../validators"

export const loopsTable = defineTable(arkOutputToConvex(Loop))
  .index("by_userId", ["userId"])
  .index("by_active_and_nextRunAt", ["active", "nextRunAt"])
