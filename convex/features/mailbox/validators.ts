import { type } from "arktype"
import { v } from "convex/values"
import { arkId } from "../../lib/ark"

const trimmed = type("string.trim")

// Where an email is. Safe to import from the frontend.
export const boxes = ["inbox", "sent", "archived", "trash"] as const
export type Box = (typeof boxes)[number]

export const vBox = v.union(...boxes.map((b) => v.literal(b)))

export const maxLabels = { perEmail: 10, perPerson: 100 } as const
export const maxLabelLength = 30
// More than a real email needs, and small enough to stay well inside a document.
export const maxHtml = 200_000
export const maxTemplates = 100

// A label you've used, with how many emails have it, so one nothing uses goes away.
export const MailLabel = type({ userId: arkId("users"), name: "string", count: "number" })

// One label on one email: what makes "everything labelled X" a page instead of a scan.
export const MailEventLabel = type({
  userId: arkId("users"),
  label: "string",
  eventId: arkId("mailEvents"),
  at: "number",
})

// An unsent email. Sealed like the rest of your mail.
export const MailDraft = type({
  userId: arkId("users"),
  details: "string",
  updatedAt: "number",
})

export const DraftDetails = type({
  to: "string",
  subject: "string",
  html: "string",
  text: "string",
  "applicationId?": "string",
  "replyTo?": "string",
})

export const SaveDraft = type({
  "id?": arkId("mailDrafts"),
  to: trimmed.to("string <= 320"),
  subject: trimmed.to("string <= 500"),
  html: type(`string <= ${maxHtml}` as "string <= 200000").configure({
    message: "That's too long to save.",
  }),
  text: "string <= 100000",
  "applicationId?": arkId("applications"),
  "replyTo?": arkId("mailEvents"),
})

// Your own wording, not mail anyone sent you, so it's kept plain like a saved answer.
export const MailTemplate = type({
  userId: arkId("users"),
  name: "string",
  subject: "string",
  html: "string",
  updatedAt: "number",
})

export const SaveTemplate = type({
  "id?": arkId("mailTemplates"),
  name: trimmed.to(type("0 < string <= 80").configure({ message: "Give it a name." })),
  subject: trimmed.to("string <= 500"),
  html: type(`string <= ${maxHtml}` as "string <= 200000").configure({
    message: "That's too long to save.",
  }),
})

export const vMailRow = v.object({
  id: v.id("mailEvents"),
  box: vBox,
  kind: v.string(),
  from: v.string(),
  to: v.optional(v.string()),
  subject: v.string(),
  at: v.number(),
  sent: v.boolean(),
  read: v.boolean(),
  labels: v.array(v.string()),
  applicationId: v.optional(v.id("applications")),
  company: v.optional(v.string()),
})

export const vMailContent = v.union(
  v.null(),
  v.object({
    from: v.string(),
    fromName: v.optional(v.string()),
    to: v.string(),
    subject: v.string(),
    text: v.string(),
    html: v.optional(v.string()),
    attachments: v.array(v.string()),
  })
)
