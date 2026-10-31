import { defineSchema, defineTable } from "convex/server"
import { v } from "convex/values"

// What Cloudflare's send API takes. Never stored as is: it arrives in each call.
export const vEmail = v.object({
  from: v.union(v.string(), v.object({ address: v.string(), name: v.string() })),
  to: v.array(v.string()),
  cc: v.optional(v.array(v.string())),
  bcc: v.optional(v.array(v.string())),
  replyTo: v.optional(v.string()),
  subject: v.string(),
  text: v.optional(v.string()),
  html: v.optional(v.string()),
  attachments: v.optional(
    v.array(
      v.object({
        content: v.string(),
        filename: v.string(),
        type: v.string(),
        disposition: v.string(),
        content_id: v.optional(v.string()),
      })
    )
  ),
  // Threading headers such as In-Reply-To and References. Cloudflare sets Message-ID.
  headers: v.optional(v.record(v.string(), v.string())),
})

export default defineSchema({
  emails: defineTable({
    // Whose mailbox this is, as the app's id for them.
    owner: v.string(),
    direction: v.union(v.literal("inbound"), v.literal("outbound")),
    status: v.union(
      v.literal("queued"),
      v.literal("sent"),
      v.literal("failed"),
      v.literal("received")
    ),
    // The message and any error, in whatever form the app stores them. The component
    // never reads them, so the app can encrypt them.
    payload: v.string(),
    error: v.optional(v.string()),
  }).index("by_owner_and_direction", ["owner", "direction"]),
})
