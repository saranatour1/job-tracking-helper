import { type } from "arktype"
import { arkId, arkOutputToConvex } from "../../lib/ark"
import { statuses } from "../applications/validators"
import { kinds } from "./match"
import { v } from "convex/values"

const trimmed = type("string.trim")

// What someone pastes to connect their Cloudflare account. Safe to import from the frontend.
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

// What `details` holds once opened. Shown to its owner, never to anyone else.
export const Details = type({
  accountId: "string",
  fromAddress: "string",
  "zoneId?": "string",
  // Where the Worker also forwards each email, so mail still reaches an everyday inbox.
  "forwardTo?": "string",
})

export type Details = typeof Details.infer

// An email as the app seals it into the component: what was sent, and Cloudflare's
// Message-ID once it went out, for threading replies.
export const Sent = type({
  from: "string",
  to: "string[]",
  subject: "string",
  "text?": "string",
  "messageId?": "string",
})

// An email as it arrives, parsed and sealed into the component.
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

// Incoming mail, once the app has set it up: the Worker it deployed, the routing rule
// that feeds it, and a hash of the secret the Worker sends, so checking each email
// needs no decryption.
export const Inbound = type({
  secretHash: "string",
  worker: "string",
  ruleId: "string",
  at: "number",
})

// What the token was allowed to do when it was added. Sending is unknown when the
// token can't list the domain's sending settings; a test send tells for sure.
export const Access = type({ "sending?": "boolean", workers: "boolean", routing: "boolean" })

// What the person lets the app do for them: send mail, change their Cloudflare setup,
// keep mail sent to them, and let Jev read it. All off until they turn one on.
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

// An email written from an application. `replyTo` is the email it answers.
export const SendMail = type({
  applicationId: arkId("applications"),
  to: trimmed.to(type("string.email").configure({ message: "Send to a full email address." })),
  subject: trimmed.to(
    type(/^[^\r\n]{1,500}$/).configure({ message: "Give it a subject of one line." })
  ),
  text: trimmed.to(
    type("0 < string <= 20000").configure({ message: "Write up to 20,000 characters." })
  ),
  "replyTo?": arkId("mailEvents"),
})

// One Cloudflare account per person, for sending from their own domain. Everything
// they typed is sealed with lib/secrets; only the dates and permissions are plain.
export const EmailConnection = type({
  userId: arkId("users"),
  details: "string",
  // Opened only inside the action that sends, and never sent to the browser.
  token: "string",
  tokenAddedAt: "number",
  access: Access,
  // Checked on the server before the app does any of these.
  allow: Allow,
  // Random and public: it names this person's inbound URL, nothing else.
  "inboundId?": "string",
  "inbound?": Inbound,
})

// What a mail event's sealed `note` holds: enough for one timeline line.
export const MailNote = type({
  from: "string",
  subject: "string",
  "portalUrl?": "string",
  // An interview's proposed time, as written, in UTC milliseconds (see slotOf).
  "slot?": "number",
  // The zone the email gave with that time, when it gave one (see zoneOf).
  "slotZone?": "string",
  // Who it went to, on mail sent from an application.
  "to?": "string",
})

// Where Jev moved an application from and to, so the move can be undone.
export const Moved = type({ from: type.enumerated(...statuses), to: type.enumerated(...statuses) })

// One email, sorted: the application it's about, if any, and what it says. `by` says how
// it was filed; "sent" is mail written from the application itself.
// The kind and suggested status are plain, like the application's own status; who
// wrote, the subject and any portal link are sealed in `note`.
export const MailEvent = type({
  userId: arkId("users"),
  // The email in the cloudflareEmail component.
  emailId: "string",
  "applicationId?": arkId("applications"),
  kind: type.enumerated(...kinds),
  note: "string",
  at: "number",
  // A status the email suggests, until the person accepts or dismisses it.
  "suggest?": type.enumerated(...statuses),
  // Set when Jev moved the application itself, so the person can undo it.
  "moved?": Moved,
  // A one-way hash of the email's Message-ID, bound to its owner, so a reply can find
  // the thread it belongs to without the ID being stored. See threadKeyOf.
  "messageKey?": "string",
  by: "'rules' | 'jev' | 'you' | 'thread' | 'tag' | 'sent'",
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
    // Each application has its own address to give out.
    tracking: v.boolean(),
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
  event: arkOutputToConvex(MailEvent.omit("moved")),
  move: v.boolean(),
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
