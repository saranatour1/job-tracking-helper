import { type } from "arktype"
import { defineTable } from "convex/server"
import { arkId, arkOutputToConvex } from "../../../lib/ark"

// Every field is optional: a new or deleted account has none of them.
export const User = type({
  "name?": "string",
  "email?": "string",
  "userName?": "string",
  "imageId?": arkId("_storage"),
})

export const usersTable = defineTable(arkOutputToConvex(User))
  .index("by_userName", ["userName"])
  .index("by_imageId", ["imageId"])
