import { defineTable } from "convex/server"
import { v } from "convex/values"
import { arkOutputToConvex } from "../../../lib/ark"
import { Company, JobBoard, vSitemapRole } from "../validators"

export const jobBoardsTable = defineTable(arkOutputToConvex(JobBoard))
  .index("by_kind_and_slug", ["kind", "slug"])
  .index("by_fetchedAt", ["fetchedAt"])
  .index("by_jobs", ["jobs"])
  .index("by_researchedAt", ["researchedAt"])
  .index("by_companyId", ["companyId"])

export const companiesTable = defineTable(arkOutputToConvex(Company)).index("by_domain", ["domain"])

export const jobCatalogTable = defineTable({
  boards: v.number(),
  sitemap: v.optional(v.id("_storage")),
  sitemapWanted: v.optional(v.number()),
  sitemapRound: v.optional(v.number()),
})

// The jobs sitemap's roles, a batch per page, in rounds; jobCatalog says which round shows.
export const sitemapPagesTable = defineTable({
  round: v.number(),
  roles: v.array(vSitemapRole),
}).index("by_round", ["round"])
