import { defineTable } from "convex/server"
import { type } from "arktype"
import { arkId, arkOutputToConvex } from "../../../lib/ark"
import { entryKinds } from "../rows"

// A label and a value: an answer to a question (`answer`), or a form field from the
// Prefilled tab (`field`). `group` is the Preferences step or the Prefilled section,
// and `key` names a built-in question so its label can change without a migration.
export const ProfileEntry = type({
  userId: arkId("users"),
  kind: type.enumerated(...entryKinds),
  group: "string",
  key: "string",
  label: "string",
  value: "string",
  order: "number",
  // For `field` rows: when auto-apply last put this answer in a form, and how often.
  "lastUsedAt?": "number",
  "useCount?": "number",
})

export const profileEntriesTable = defineTable(arkOutputToConvex(ProfileEntry)).index(
  "by_userId_and_kind_and_order",
  ["userId", "kind", "order"]
)
