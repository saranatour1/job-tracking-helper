import { defineSchema, defineTable } from "convex/server"
import { v } from "convex/values"

export default defineSchema({
  notifications: defineTable({
    owner: v.string(),
    kind: v.string(),
    ref: v.optional(v.string()),
    at: v.number(),
    readAt: v.optional(v.number()),
  })
    .index("by_owner_and_at", ["owner", "at"])
    .index("by_owner_and_readAt", ["owner", "readAt"]),
  settings: defineTable({ owner: v.string(), muted: v.array(v.string()) }).index("by_owner", [
    "owner",
  ]),
})
