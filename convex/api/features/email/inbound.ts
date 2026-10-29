// Incoming mail: Email Routing sends mail for the person's address to a small Worker
// in their Cloudflare account, which posts the raw message here. It's parsed, sealed
// and kept in the cloudflareEmail component, all only if they allowed it.
import { HOUR, RateLimiter } from "@convex-dev/rate-limiter"
import { getAuthUserId } from "@convex-dev/auth/server"
import { ConvexError, v } from "convex/values"
import PostalMime from "postal-mime"
import { components, internal } from "../../../_generated/api"
import type { Id } from "../../../_generated/dataModel"
import { action, type ActionCtx, env, httpAction } from "../../../_generated/server"
import { authedQuery } from "../../../lib/functions"
import { open, seal } from "../../../lib/secrets"
import { createRule, removeInbound, routingEnabled, uploadWorker } from "./cloudflare"
import { aad, keys, openJson } from "./internal"
import { Details, Received } from "./models"

export const limits = new RateLimiter(components.rateLimiter, {
  connectEmail: { kind: "fixed window", rate: 10, period: HOUR },
  testEmail: { kind: "fixed window", rate: 5, period: HOUR },
  setUpInbound: { kind: "fixed window", rate: 5, period: HOUR },
  // Enough for a busy job search, low enough that a flood can't fill the table.
  inboundEmail: { kind: "token bucket", rate: 200, period: HOUR, capacity: 50 },
})

export const userIdOf = async (ctx: ActionCtx) => {
  const userId = await getAuthUserId(ctx)
  if (!userId) throw new Error("Not signed in")
  return userId
}

export const secretKeys = () =>
  keys().catch(() => {
    throw new ConvexError("Email isn't set up on this server yet: SECRETS_KEYS is missing.")
  })

/** The connection with its details and token opened in memory, for an action to use. */
export const openConnection = async (ctx: ActionCtx, userId: Id<"users">) => {
  const row = await ctx.runQuery(internal.email.sealed, { userId })
  if (!row) throw new ConvexError("Connect Cloudflare first.")
  const k = await secretKeys()
  const details = await openJson(k, row.details, aad.details(userId), Details)
  const token = await open(k, row.token, aad.token(userId)).catch(() => null)
  if (!details || !token)
    throw new ConvexError("The saved connection couldn't be read. Paste your token again.")
  return { row, k, details, token }
}

const sha256 = async (text: string) =>
  Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")

const cloudflare = (cause: unknown) =>
  new ConvexError(`Cloudflare: ${cause instanceof Error ? cause.message : String(cause)}`)

// Deploys the Worker and adds the routing rule for the sending address. Routing must
// already be on: turning it on replaces the domain's MX records, which would cut off
// any other mailbox on the domain, so that stays the person's call.
const setUpInbound = action({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const userId = await userIdOf(ctx)
    const { row, details, token } = await openConnection(ctx, userId)
    if (!row.allow.setup || !row.allow.receive)
      throw new ConvexError("Turn on “Set up Cloudflare for you” and “Keep incoming mail” first.")
    const { ok } = await limits.limit(ctx, "setUpInbound", { key: userId })
    if (!ok) throw new ConvexError("Too many tries. Wait an hour and try again.")
    const domain = details.fromAddress.split("@")[1]!
    if (!details.zoneId)
      throw new ConvexError(
        `${domain} isn't in this Cloudflare account, or the token can't read it.`
      )
    if ((await routingEnabled(details.zoneId, token)) === false)
      throw new ConvexError(
        `Turn on Email Routing for ${domain} in Cloudflare first. It replaces the domain's MX records, so only do it if no other mailbox uses ${domain}.`
      )
    const inboundId = crypto.randomUUID()
    const secret = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
    const worker = `job-tracking-helper-${inboundId.slice(0, 8)}`
    let ruleId: string
    try {
      await uploadWorker(details.accountId, token, worker, {
        inboundUrl: `${env.CONVEX_SITE_URL}/email/inbound/${inboundId}`,
        secret,
      })
      ruleId = await createRule(details.zoneId, token, details.fromAddress, worker)
    } catch (cause) {
      await removeInbound(details.accountId, details.zoneId, token, worker, "")
      throw cloudflare(cause)
    }
    // A previous setup's rule and Worker go once the new ones are in place.
    if (row.inbound)
      await removeInbound(
        details.accountId,
        details.zoneId,
        token,
        row.inbound.worker,
        row.inbound.ruleId
      )
    await ctx.runMutation(internal.email.setInbound, {
      userId,
      inboundId,
      inbound: { secretHash: await sha256(secret), worker, ruleId, at: Date.now() },
    })
    return null
  },
})

const tearDown = async (ctx: ActionCtx, userId: Id<"users">) => {
  const { row, details, token } = await openConnection(ctx, userId)
  if (row.inbound && details.zoneId)
    await removeInbound(
      details.accountId,
      details.zoneId,
      token,
      row.inbound.worker,
      row.inbound.ruleId
    )
}

const stopInbound = action({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const userId = await userIdOf(ctx)
    await tearDown(ctx, userId)
    await ctx.runMutation(internal.email.setInbound, { userId })
    return null
  },
})

// Removes the Worker and rule first, so mail isn't sent to a URL that no longer
// answers. A connection that can't be opened is deleted anyway.
const disconnect = action({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const userId = await userIdOf(ctx)
    await tearDown(ctx, userId).catch(() => null)
    await ctx.runMutation(internal.email.remove, { userId })
    return null
  },
})

const cap = (text: string | undefined, max: number) => text?.slice(0, max)

// POST /email/inbound/<inboundId>, called by the person's Worker. A 4xx makes the
// Worker turn the message away; a 5xx makes Cloudflare try again later.
export const receive = httpAction(async (ctx, req) => {
  const inboundId = new URL(req.url).pathname.split("/").pop() ?? ""
  const target = await ctx.runQuery(internal.email.inboundTarget, { inboundId })
  const bearer = req.headers.get("Authorization")?.replace(/^Bearer /, "") ?? ""
  // Comparing hashes: the secret is random, so how long the comparison takes says nothing.
  if (!target || (await sha256(bearer)) !== target.secretHash)
    return new Response("Unknown inbound address", { status: 401 })
  if (!target.receive) return new Response("Not receiving mail", { status: 403 })
  const { ok } = await limits.limit(ctx, "inboundEmail", { key: target.userId })
  if (!ok) return new Response("Too much mail at once", { status: 503 })
  const raw = await req.arrayBuffer()
  const mail = await PostalMime.parse(raw)
  const email: typeof Received.infer = {
    from: mail.from?.address || req.headers.get("X-Envelope-From") || "",
    fromName: mail.from?.name || undefined,
    to: [req.headers.get("X-Envelope-To") || ""],
    subject: cap(mail.subject, 500) ?? "",
    // Sized so a sealed message stays well under Convex's 1 MiB document limit.
    text: cap(mail.text, 100_000),
    html: cap(mail.html, 300_000),
    messageId: mail.messageId,
    inReplyTo: mail.inReplyTo,
    references: mail.references,
    date: mail.date,
    attachments: mail.attachments.flatMap((a) => (a.filename ? [a.filename] : [])),
  }
  const k = await secretKeys()
  await ctx.runMutation(components.cloudflareEmail.lib.receive, {
    owner: target.userId,
    payload: await seal(k, JSON.stringify(email), aad.email(target.userId)),
  })
  return new Response(null, { status: 204 })
})

// The newest incoming mail, opened for its owner: who it's from, the subject and a
// line of the text.
const recentMail = authedQuery({
  args: {},
  returns: v.array(
    v.object({
      id: v.string(),
      from: v.string(),
      subject: v.string(),
      snippet: v.string(),
      at: v.number(),
    })
  ),
  handler: async (ctx) => {
    const k = await keys().catch(() => null)
    if (!k) return []
    const emails = await ctx.runQuery(components.cloudflareEmail.lib.list, {
      owner: ctx.userId,
      direction: "inbound",
      limit: 10,
    })
    const opened = await Promise.all(
      emails.map(async (email) => {
        const mail = await openJson(k, email.payload, aad.email(ctx.userId), Received)
        return (
          mail && {
            id: email._id,
            from: mail.fromName || mail.from,
            subject: mail.subject || "(no subject)",
            snippet: (mail.text ?? "").replace(/\s+/g, " ").trim().slice(0, 140),
            at: email._creationTime,
          }
        )
      })
    )
    return opened.filter((mail) => mail !== null)
  },
})

export const inboundApi = { setUpInbound, stopInbound, disconnect, recentMail }
