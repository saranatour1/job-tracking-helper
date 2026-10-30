import { defineTable } from "convex/server"
import { arkOutputToConvex } from "../../../lib/ark"
import { ProfileEntry } from "../validators"

export const profileEntriesTable = defineTable(arkOutputToConvex(ProfileEntry)).index(
  "by_userId_and_kind_and_order",
  ["userId", "kind", "order"]
)
