import { defineTable } from "convex/server"
import { v } from "convex/values"
import { arkOutputToConvex } from "../../../lib/ark"
import { Company, JobBoard, vCatalogSummary } from "../validators"

export const jobBoardsTable = defineTable(arkOutputToConvex(JobBoard))
  .index("by_kind_and_slug", ["kind", "slug"])
  .index("by_fetchedAt", ["fetchedAt"])
  .index("by_jobs", ["jobs"])
  .index("by_researchedAt", ["researchedAt"])
  .index("by_companyId", ["companyId"])

export const companiesTable = defineTable(arkOutputToConvex(Company)).index("by_domain", ["domain"])

export const jobCatalogTable = defineTable({
  boards: v.number(),
  // No longer written or read: `api/migrations:clearOldCounts` takes them off older rows.
  jobs: v.optional(v.number()),
  summary: v.optional(vCatalogSummary),
  countsReady: v.optional(v.boolean()),
})
