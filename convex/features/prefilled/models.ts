import { defineTable } from "convex/server"
import { arkOutputToConvex } from "../../lib/ark"
import { AutoApply, Prefill } from "./validators"

export const prefillsTable = defineTable(arkOutputToConvex(Prefill))
  // Newest first for the lists; the other one sorts by posting.
  // eslint-disable-next-line @convex-dev/no-duplicate-indexes
  .index("by_userId", ["userId"])
  .index("by_userId_and_urlKey", ["userId", "urlKey"])

export const autoAppliesTable = defineTable(arkOutputToConvex(AutoApply))
  .index("by_userId_and_queuedAt", ["userId", "queuedAt"])
  .index("by_userId_and_urlKey", ["userId", "urlKey"])
