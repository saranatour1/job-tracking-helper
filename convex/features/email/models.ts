import { defineTable } from "convex/server"
import { arkOutputToConvex } from "../../lib/ark"
import { EmailConnection, MailEvent } from "./validators"

export const emailConnectionsTable = defineTable(arkOutputToConvex(EmailConnection))
  .index("by_userId", ["userId"])
  .index("by_inboundId", ["inboundId"])

export const mailEventsTable = defineTable(arkOutputToConvex(MailEvent))
  .index("by_userId_and_applicationId_and_at", ["userId", "applicationId", "at"])
  .index("by_userId_and_at", ["userId", "at"])
  .index("by_userId_and_kind_and_at", ["userId", "kind", "at"])
  .index("by_userId_and_box_and_at", ["userId", "box", "at"])
  .index("by_userId_and_box_and_readAt", ["userId", "box", "readAt"])
  .index("by_emailId", ["emailId"])
  .index("by_userId_and_messageKey", ["userId", "messageKey"])
