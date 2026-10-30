import { defineTable } from "convex/server"
import { arkOutputToConvex } from "../../../lib/ark"
import { JobBoard } from "../validators"

export const jobBoardsTable = defineTable(arkOutputToConvex(JobBoard))
  .index("by_kind_and_slug", ["kind", "slug"])
  .index("by_fetchedAt", ["fetchedAt"])
