import { defineTable } from "convex/server"
import { arkOutputToConvex } from "../../../lib/ark"
import { JobLead } from "../validators"

export const jobLeadsTable = defineTable(arkOutputToConvex(JobLead))
  .index("by_userId_and_urlKey", ["userId", "urlKey"])
  .index("by_userId_and_status", ["userId", "status"])
  .index("by_userId_and_feedback", ["userId", "feedback"])
  // Someone's fits, best first, for the Jobs page's "Fits me".
  .index("by_userId_and_verdict_and_fit", ["userId", "verdict", "fit"])
  // The job behind an application, for its side panel.
  .index("by_applicationId", ["applicationId"])
  // The fits of someone's applications, for the badges on the board.
  .index("by_userId_and_applicationId", ["userId", "applicationId"])
