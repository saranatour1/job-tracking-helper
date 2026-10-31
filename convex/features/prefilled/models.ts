import { defineTable } from "convex/server"
import { arkOutputToConvex } from "../../lib/ark"
import { Prefill } from "./validators"

export const prefillsTable = defineTable(arkOutputToConvex(Prefill))
  // Newest first for the lists; the other one sorts by posting.
  // eslint-disable-next-line @convex-dev/no-duplicate-indexes
  .index("by_userId", ["userId"])
  .index("by_userId_and_urlKey", ["userId", "urlKey"])
  // What to unlink when an application is deleted.
  .index("by_userId_and_applicationId", ["userId", "applicationId"])
