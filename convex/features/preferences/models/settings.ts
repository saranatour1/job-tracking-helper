import { defineTable } from "convex/server"
import { arkOutputToConvex } from "../../../lib/ark"
import { PreferenceSettings } from "../validators"

export const preferencesTable = defineTable(arkOutputToConvex(PreferenceSettings))
  .index("by_userId", ["userId"])
  .index("by_resumeId", ["resumeId"])
