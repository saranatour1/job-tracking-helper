import { defineTable } from "convex/server"
import { arkOutputToConvex } from "../../lib/ark"
import { Contact } from "./validators"

export const contactsTable = defineTable(arkOutputToConvex(Contact))
  .index("by_userId_and_key", ["userId", "key"])
  .index("by_userId_and_lastAt", ["userId", "lastAt"])
  .index("by_userId_and_applicationId", ["userId", "applicationId"])
