import { type } from "arktype"
import { defineTable } from "convex/server"
import { arkId, arkOutputToConvex } from "../../lib/ark"

// Every field is optional: a new or deleted account has none of them.
export const User = type({
  "name?": "string",
  "email?": "string",
  "userName?": "string",
  "imageId?": arkId("_storage"),
  // Set when someone saves or skips Preferences, so first run only sends them there once.
  "onboardedAt?": "number",
  // How many days applications stay in the Trash before they're deleted; 0 keeps them.
  // Unset means 90.
  "trashDays?": "number",
  // When auto-apply was turned on under Account; unset means off.
  "autoApplyAt?": "number",
  // Fill each form but stop before sending, to see what it would use first.
  "autoApplyDryRun?": "boolean",
})

export const usersTable = defineTable(arkOutputToConvex(User))
  .index("by_userName", ["userName"])
  .index("by_imageId", ["imageId"])
