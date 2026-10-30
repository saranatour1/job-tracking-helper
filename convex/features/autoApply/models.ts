import { defineTable } from "convex/server"
import { arkOutputToConvex } from "../../lib/ark"
import { AutoApply } from "./validators"

export const autoAppliesTable = defineTable(arkOutputToConvex(AutoApply))
  .index("by_userId_and_queuedAt", ["userId", "queuedAt"])
  .index("by_userId_and_urlKey", ["userId", "urlKey"])
