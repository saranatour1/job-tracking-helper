import { defineSchema, defineTable } from "convex/server"
import { Application } from "./features/applications/validators"
import { arkId, arkOutputToConvex } from "./lib/ark"

export default defineSchema({
  users: defineTable({}),
  applications: defineTable(arkOutputToConvex(Application.and({ userId: arkId("users") }))).index(
    "by_userId",
    ["userId"]
  ),
})
