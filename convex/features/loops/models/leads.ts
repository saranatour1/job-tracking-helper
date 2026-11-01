import { defineTable } from "convex/server"
import { arkOutputToConvex } from "../../../lib/ark"
import { JobLead } from "../validators"

export const jobLeadsTable = defineTable(arkOutputToConvex(JobLead))
  .index("by_userId_and_urlKey", ["userId", "urlKey"])
  .index("by_userId_and_roleKey", ["userId", "roleKey"])
  .index("by_userId_and_status", ["userId", "status"])
  .index("by_userId_and_feedback", ["userId", "feedback"])
  .index("by_userId_and_verdict_and_fit", ["userId", "verdict", "fit"])
  .index("by_loopId_and_status_and_fit", ["loopId", "status", "fit"])
  .index("by_applicationId", ["applicationId"])
