import { defineTable } from "convex/server"
import { arkOutputToConvex } from "../../../lib/ark"
import { SourceUsage } from "../validators"

export const sourceUsageTable = defineTable(arkOutputToConvex(SourceUsage)).index(
  "by_provider_and_month",
  ["provider", "month"]
)
