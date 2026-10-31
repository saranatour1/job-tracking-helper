import { defineTable } from "convex/server"
import { arkOutputToConvex } from "../../lib/ark"
import { MailDraft, MailEventLabel, MailLabel, MailTemplate } from "./validators"

export const mailLabelsTable = defineTable(arkOutputToConvex(MailLabel)).index(
  "by_userId_and_name",
  ["userId", "name"]
)

export const mailEventLabelsTable = defineTable(arkOutputToConvex(MailEventLabel))
  .index("by_userId_and_label_and_at", ["userId", "label", "at"])
  .index("by_eventId", ["eventId"])

export const mailDraftsTable = defineTable(arkOutputToConvex(MailDraft)).index(
  "by_userId_and_updatedAt",
  ["userId", "updatedAt"]
)

export const mailTemplatesTable = defineTable(arkOutputToConvex(MailTemplate)).index(
  "by_userId_and_updatedAt",
  ["userId", "updatedAt"]
)
