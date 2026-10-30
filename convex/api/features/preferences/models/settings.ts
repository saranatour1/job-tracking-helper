import { defineTable } from "convex/server"
import { type } from "arktype"
import { arkId, arkOutputToConvex } from "../../../../lib/ark"
import { Review } from "../resumeRules"
import { workModes } from "../validators"

// One small row per user: settings that have a single value. Lists and answers live
// in `preferenceTags` and `profileEntries`, one row each, so this row never grows.
export const PreferenceSettings = type({
  userId: arkId("users"),
  workMode: type.enumerated(...workModes),
  "resumeId?": arkId("_storage"),
  "resumeName?": "string",
  // The resume's text and its last review, set by Review on the Resume tab and
  // cleared when the file changes.
  "resumeText?": "string",
  "resumeReview?": Review,
  // Set the first time the Prefilled tab is saved; until then the page suggests fields.
  "prefilledAt?": "number",
})

export const preferencesTable = defineTable(arkOutputToConvex(PreferenceSettings))
  .index("by_userId", ["userId"])
  .index("by_resumeId", ["resumeId"])
