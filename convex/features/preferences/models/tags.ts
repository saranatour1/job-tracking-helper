import { defineTable } from "convex/server"
import { type } from "arktype"
import { arkId, arkOutputToConvex } from "../../../lib/ark"
import { tagKinds } from "../rows"

// One short word or phrase per row: an interest, a skill, a place, a company. `kind`
// says which list it belongs to, and `order` keeps the order it was added in.
export const PreferenceTag = type({
  userId: arkId("users"),
  kind: type.enumerated(...tagKinds),
  value: "string",
  order: "number",
})

export const preferenceTagsTable = defineTable(arkOutputToConvex(PreferenceTag)).index(
  "by_userId_and_kind_and_order",
  ["userId", "kind", "order"]
)
