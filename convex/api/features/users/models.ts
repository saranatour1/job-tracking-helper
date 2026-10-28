import { type } from "arktype"
import { defineTable } from "convex/server"
import { arkId, arkOutputToConvex } from "../../../lib/ark"
import { Preferences } from "./validators"

// Every field is optional: a new or deleted account has none of them.
export const User = type({
  "name?": "string",
  "email?": "string",
  "userName?": "string",
  "imageId?": arkId("_storage"),
  "preferences?": Preferences,
  "resumeId?": arkId("_storage"),
  "resumeName?": "string",
  // Set when someone saves or skips Preferences, so first-run only sends them there once.
  "onboardedAt?": "number",
})

export const usersTable = defineTable(arkOutputToConvex(User))
  .index("by_userName", ["userName"])
  .index("by_imageId", ["imageId"])
  .index("by_resumeId", ["resumeId"])
