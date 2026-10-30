import { defineTable } from "convex/server"
import { arkOutputToConvex } from "../../../lib/ark"
import { PreferenceTag } from "../validators"

export const preferenceTagsTable = defineTable(arkOutputToConvex(PreferenceTag)).index(
  "by_userId_and_kind_and_order",
  ["userId", "kind", "order"]
)
