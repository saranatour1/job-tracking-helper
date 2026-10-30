import { defineSchema, defineTable } from "convex/server"
import { v } from "convex/values"

export default defineSchema({
  // One line in someone's inbox. It names what happened and points at where it
  // happened; the app builds the text when it's read, so nothing private is copied here.
  notifications: defineTable({
    owner: v.string(),
    // The app's name for what happened, such as "mail.rejection".
    kind: v.string(),
    // The app's id for the thing it's about, such as a mail event.
    ref: v.optional(v.string()),
    at: v.number(),
    readAt: v.optional(v.number()),
  })
    .index("by_owner_and_at", ["owner", "at"])
    .index("by_owner_and_readAt", ["owner", "readAt"]),
  // The kinds someone turned off. Everything else reaches their inbox.
  settings: defineTable({ owner: v.string(), muted: v.array(v.string()) }).index("by_owner", [
    "owner",
  ]),
})
