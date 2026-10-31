import { type } from "arktype"
import { arkId, arkOutputToConvex } from "../../lib/ark"
import { statuses } from "../applications/validators"
import { kinds } from "./match"
import { v } from "convex/values"

const trimmed = type("string.trim")

// An empty token keeps the saved one, so the account or address can change without
// pasting it again. Each rule has a fixed message: arktype's default repeats the
// value, and a token must never end up on screen or in a server error log.
export const Connect = type({
  accountId: trimmed.to(
    type(/^[0-9a-f]{32}$/).configure({
      message: "Use the 32-character account ID from your Cloudflare dashboard.",
    })
  ),
  apiToken: trimmed.to(
    type(/^$|^[\w-]{20,200}$/).configure({ message: "Paste a Cloudflare API token." })
  ),
  fromAddress: trimmed.to(
    type("string.email").configure({ message: "Use an email address on your domain." })
  ),
})
export type Connect = typeof Connect.infer

export const Details = type({
  accountId: "string",
  fromAddress: "string",
  "zoneId?": "string",
  "forwardTo?": "string",
})

export type Details = typeof Details.infer

export const Sent = type({
  from: "string",
  to: "string[]",
  subject: "string",
  "text?": "string",
  "messageId?": "string",
})

export const Received = type({
  from: "string",
  "fromName?": "string",
  to: "string[]",
  subject: "string",
  "text?": "string",
  "html?": "string",
  "messageId?": "string",
  "inReplyTo?": "string",
  "references?": "string",
  "date?": "string",
  attachments: "string[]",
})

export const Inbound = type({
  secretHash: "string",
  worker: "string",
  ruleId: "string",
  at: "number",
  "aliasRules?": "string[]",
})

export const Access = type({
  "sending?": "boolean",
  workers: "boolean",
  routing: "boolean",
  "zone?": "boolean",
})

export const allowKeys = ["send", "setup", "receive", "read", "move", "tag"] as const

// `move` and `tag` came later, so connections from before them lack them; missing reads as
// off. `tag` means Cloudflare's subaddressing is on: without it, mail to a tagged address
// bounces, so the app won't hand one out until the person says so.
export const Allow = type({
  send: "boolean",
  setup: "boolean",
  receive: "boolean",
  read: "boolean",
  "move?": "boolean",
  "tag?": "boolean",
})

export const nothingAllowed = {
  send: false,
  setup: false,
  receive: false,
  read: false,
  move: false,
  tag: false,
}

export const SetUpInbound = type({
  "forwardTo?": trimmed.to(
    type("string.email").configure({ message: "Forward to a full email address." })
  ),
})

export const SendMail = type({
  "applicationId?": arkId("applications"),
  to: trimmed.to(type("string.email").configure({ message: "Send to a full email address." })),
  subject: trimmed.to(
    type(/^[^\r\n]{1,500}$/).configure({ message: "Give it a subject of one line." })
  ),
  text: trimmed.to(
    type("0 < string <= 20000").configure({ message: "Write up to 20,000 characters." })
  ),
  "replyTo?": arkId("mailEvents"),
  "html?": "string <= 200000",
  "draftId?": arkId("mailDrafts"),
})

export const EmailConnection = type({
  userId: arkId("users"),
  details: "string",
  token: "string",
  tokenAddedAt: "number",
  access: Access,
  allow: Allow,
  "inboundId?": "string",
  "inbound?": Inbound,
  "signaturePhoto?": arkId("_storage"),
})

export const MailNote = type({
  from: "string",
  subject: "string",
  "portalUrl?": "string",
  "slot?": "number",
  "slotZone?": "string",
  "to?": "string",
})

export const Moved = type({ from: type.enumerated(...statuses), to: type.enumerated(...statuses) })

export const MailEvent = type({
  userId: arkId("users"),
  emailId: "string",
  "applicationId?": arkId("applications"),
  kind: type.enumerated(...kinds),
  note: "string",
  at: "number",
  "suggest?": type.enumerated(...statuses),
  "moved?": Moved,
  "messageKey?": "string",
  by: "'rules' | 'jev' | 'you' | 'thread' | 'tag' | 'sent'",
  box: "'inbox' | 'sent' | 'archived' | 'trash'",
  "readAt?": "number",
  "labels?": "string[]",
})

export const vCandidate = v.object({
  id: v.id("applications"),
  company: v.string(),
  role: v.string(),
  status: v.union(...statuses.map((s) => v.literal(s))),
  at: v.number(),
  alias: v.optional(v.string()),
})

export const vRecentMail = v.array(
  v.object({
    id: v.string(),
    from: v.string(),
    subject: v.string(),
    snippet: v.string(),
    at: v.number(),
  })
)

export const vSealedConnection = v.union(
  v.null(),
  v.object({
    details: v.string(),
    token: v.string(),
    tokenAddedAt: v.number(),
    allow: arkOutputToConvex(Allow),
    inbound: v.optional(arkOutputToConvex(Inbound)),
    userEmail: v.optional(v.string()),
    signature: v.object({
      name: v.string(),
      email: v.string(),
      linkedin: v.string(),
      github: v.string(),
      x: v.string(),
    }),
    signaturePhoto: v.optional(v.id("_storage")),
  })
)

export const vSetInboundArgs = {
  userId: v.id("users"),
  inboundId: v.optional(v.string()),
  inbound: v.optional(arkOutputToConvex(Inbound)),
  details: v.optional(v.string()),
}

export const vInboundTarget = v.union(
  v.null(),
  v.object({ userId: v.id("users"), secretHash: v.string(), receive: v.boolean() })
)

export const vConnectionsPage = v.object({
  page: v.array(v.object({ userId: v.id("users"), details: v.string(), token: v.string() })),
  isDone: v.boolean(),
  continueCursor: v.string(),
})

export const vResealArgs = {
  userId: v.id("users"),
  from: v.string(),
  details: v.string(),
  token: v.string(),
}

export const vConnectionView = v.union(
  v.null(),
  v.object({
    accountId: v.string(),
    fromAddress: v.string(),
    tokenAddedAt: v.number(),
    access: arkOutputToConvex(Access),
    allow: arkOutputToConvex(Allow),
    receivingSince: v.union(v.number(), v.null()),
    forwardTo: v.optional(v.string()),
    tracking: v.boolean(),
    signaturePhotoUrl: v.optional(v.string()),
    signature: v.object({
      name: v.string(),
      email: v.string(),
      linkedin: v.string(),
      github: v.string(),
      x: v.string(),
    }),
    lastTest: v.union(
      v.null(),
      v.object({
        to: v.string(),
        status: v.string(),
        error: v.optional(v.string()),
        at: v.number(),
      })
    ),
  })
)

export const vSortContext = v.union(
  v.null(),
  v.object({
    payload: v.string(),
    read: v.boolean(),
    move: v.boolean(),
    applications: v.array(vCandidate),
  })
)

export const vRecordArgs = {
  event: arkOutputToConvex(MailEvent.omit("moved", "box")),
  move: v.boolean(),
  quiet: v.optional(v.boolean()),
}

export const vTimeline = v.array(
  v.object({
    id: v.id("mailEvents"),
    applicationId: v.union(v.id("applications"), v.null()),
    kind: v.union(...kinds.map((k) => v.literal(k))),
    from: v.string(),
    subject: v.string(),
    portalUrl: v.optional(v.string()),
    slot: v.optional(v.number()),
    slotZone: v.optional(v.string()),
    at: v.number(),
    sent: v.boolean(),
    to: v.optional(v.string()),
    suggest: v.optional(v.union(...statuses.map((s) => v.literal(s)))),
    moved: v.optional(arkOutputToConvex(Moved)),
  })
)

export const vMailBody = v.union(
  v.null(),
  v.object({
    text: v.string(),
    from: v.string(),
    to: v.string(),
    subject: v.string(),
    attachments: v.array(v.string()),
  })
)
