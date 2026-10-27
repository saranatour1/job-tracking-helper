import { defineSchema, defineTable } from "convex/server"
import { v } from "convex/values"
import { statuses } from "./features/applications/validators"

export default defineSchema({
  users: defineTable({}),
  // Stored shape only. Input rules (trimmed, non-empty) live in the arktype `Application`.
  applications: defineTable({
    userId: v.id("users"),
    company: v.string(),
    role: v.string(),
    status: v.union(...statuses.map((status) => v.literal(status))),
  }).index("by_userId", ["userId"]),
})
