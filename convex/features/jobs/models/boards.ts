import { defineTable } from "convex/server"
import { v } from "convex/values"
import { arkOutputToConvex } from "../../../lib/ark"
import { JobBoard } from "../validators"

export const jobBoardsTable = defineTable(arkOutputToConvex(JobBoard))
  .index("by_kind_and_slug", ["kind", "slug"])
  .index("by_fetchedAt", ["fetchedAt"])
  // The companies with the most open roles.
  .index("by_jobs", ["jobs"])

// One row: how big the catalog is, so the Jobs page needn't add up every board.
export const jobCatalogTable = defineTable({ boards: v.number(), jobs: v.number() })
