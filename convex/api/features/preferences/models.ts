import { defineTable } from "convex/server"
import { arkId, arkOutputToConvex } from "../../../lib/ark"
import { Preferences, PrefilledSections } from "./validators"

// One row per user, created when they save or skip Preferences. Kept apart from
// `users`, which holds only basic account details.
export const Preference = Preferences.and({
  userId: arkId("users"),
  "resumeId?": arkId("_storage"),
  "resumeName?": "string",
  // Saved apart from the answers above, from the Prefilled tab.
  "prefilled?": PrefilledSections,
})

export const preferencesTable = defineTable(arkOutputToConvex(Preference))
  .index("by_userId", ["userId"])
  .index("by_resumeId", ["resumeId"])
