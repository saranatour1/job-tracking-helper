import { type } from "arktype"
import { defineTable } from "convex/server"
import { arkId, arkOutputToConvex } from "../../../lib/ark"
import { statuses } from "../applications/validators"
import { kinds } from "./match"

// What `details` holds once opened. Shown to its owner, never to anyone else.
export const Details = type({
  accountId: "string",
  fromAddress: "string",
  "zoneId?": "string",
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
export const allowKeys = ["send", "setup", "receive", "read", "move"] as const
// `move` came later, so connections from before it lack it; missing reads as off.
export const Allow = type({
  send: "boolean",
  setup: "boolean",
  receive: "boolean",
  read: "boolean",
  "move?": "boolean",
})
export const nothingAllowed = {
  send: false,
  setup: false,
  receive: false,
  read: false,
  move: false,
}

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

export const emailConnectionsTable = defineTable(arkOutputToConvex(EmailConnection))
  .index("by_userId", ["userId"])
  .index("by_inboundId", ["inboundId"])

// What a mail event's sealed `note` holds: enough for one timeline line.
export const MailNote = type({ from: "string", subject: "string", "portalUrl?": "string" })

// Where Jev moved an application from and to, so the move can be undone.
export const Moved = type({ from: type.enumerated(...statuses), to: type.enumerated(...statuses) })

// One incoming email, sorted: the application it's about, if any, and what it says.
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
  by: "'rules' | 'jev' | 'you' | 'thread'",
})

export const mailEventsTable = defineTable(arkOutputToConvex(MailEvent))
  .index("by_userId_and_applicationId", ["userId", "applicationId"])
  .index("by_emailId", ["emailId"])
  .index("by_userId_and_messageKey", ["userId", "messageKey"])
