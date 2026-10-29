import { type } from "arktype"
import { defineTable } from "convex/server"
import { arkId, arkOutputToConvex } from "../../../lib/ark"

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

// What the token was allowed to do when it was added. Sending is unknown when the
// token can't list the domain's sending settings; a test send tells for sure.
export const Access = type({ "sending?": "boolean", workers: "boolean", routing: "boolean" })

// What the person lets the app do for them: send mail, change their Cloudflare setup,
// keep mail sent to them, and let Jev read it. All off until they turn one on.
export const allowKeys = ["send", "setup", "receive", "read"] as const
export const Allow = type({
  send: "boolean",
  setup: "boolean",
  receive: "boolean",
  read: "boolean",
})
export const nothingAllowed = { send: false, setup: false, receive: false, read: false }

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
})

export const emailConnectionsTable = defineTable(arkOutputToConvex(EmailConnection)).index(
  "by_userId",
  ["userId"]
)
