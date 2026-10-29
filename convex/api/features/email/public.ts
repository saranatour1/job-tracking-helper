import { HOUR, RateLimiter } from "@convex-dev/rate-limiter"
import { getAuthUserId } from "@convex-dev/auth/server"
import { type } from "arktype"
import { ConvexError, v } from "convex/values"
import { components, internal } from "../../../_generated/api"
import { action, type ActionCtx } from "../../../_generated/server"
import { arkOutputToConvex, arkToConvex } from "../../../lib/ark"
import { arkMutation, authedMutation, authedQuery } from "../../../lib/functions"
import { open, seal } from "../../../lib/secrets"
import { accessOf, tokenStatus } from "./cloudflare"
import { aad, keys, openJson } from "./internal"
import { Access, Allow, allowKeys, Details, Sent } from "./models"
import { Connect } from "./validators"

// Each connect checks the token with Cloudflare, and each test is a real email.
const limits = new RateLimiter(components.rateLimiter, {
  connectEmail: { kind: "fixed window", rate: 10, period: HOUR },
  testEmail: { kind: "fixed window", rate: 5, period: HOUR },
})

const userIdOf = async (ctx: ActionCtx) => {
  const userId = await getAuthUserId(ctx)
  if (!userId) throw new Error("Not signed in")
  return userId
}

const secretKeys = () =>
  keys().catch(() => {
    throw new ConvexError("Email isn't set up on this server yet: SECRETS_KEYS is missing.")
  })

// The connection, opened for its owner. The token itself never leaves the server.
// A connection whose details can't be opened (its key was removed) reads as none,
// so the person can paste it again.
const connection = authedQuery({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      accountId: v.string(),
      fromAddress: v.string(),
      tokenAddedAt: v.number(),
      access: arkOutputToConvex(Access),
      allow: arkOutputToConvex(Allow),
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
  ),
  handler: async (ctx) => {
    const row = await ctx.db
      .query("emailConnections")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
      .unique()
    if (!row) return null
    const k = await keys().catch(() => null)
    const details = k && (await openJson(k, row.details, aad.details(ctx.userId), Details))
    if (!k || !details) return null
    const [last] = await ctx.runQuery(components.cloudflareEmail.lib.list, {
      owner: ctx.userId,
      direction: "outbound",
      limit: 1,
    })
    const sent = last && (await openJson(k, last.payload, aad.email(ctx.userId), Sent))
    return {
      accountId: details.accountId,
      fromAddress: details.fromAddress,
      tokenAddedAt: row.tokenAddedAt,
      access: row.access,
      allow: row.allow,
      lastTest:
        last && sent
          ? {
              to: sent.to.join(", "),
              status: last.status,
              error:
                last.error && (await open(k, last.error, aad.email(ctx.userId)).catch(() => "")),
              at: last._creationTime,
            }
          : null,
    }
  },
})

// Connecting, replacing the token and changing the account or address are the same.
// With no token pasted, the saved one is opened here and reused; it never goes to the
// browser, not even in part. Either way the token is checked with Cloudflare against
// the account before anything is saved.
const connect = action({
  args: arkToConvex(Connect),
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await userIdOf(ctx)
    const input = Connect(args)
    if (input instanceof type.errors) throw new ConvexError(input.summary)
    const { ok } = await limits.limit(ctx, "connectEmail", { key: userId })
    if (!ok) throw new ConvexError("Too many tries. Wait an hour and try again.")
    const k = await secretKeys()
    const saved = input.apiToken ? null : await ctx.runQuery(internal.email.sealed, { userId })
    const apiToken =
      input.apiToken || (saved && (await open(k, saved.token, aad.token(userId)).catch(() => null)))
    if (!apiToken) throw new ConvexError("Paste a Cloudflare API token.")
    const status = await tokenStatus(input.accountId, apiToken)
    if (status !== "active")
      throw new ConvexError(
        status === "invalid"
          ? "Cloudflare doesn't recognize that token for this account."
          : `Cloudflare says that token is ${status}.`
      )
    const domain = input.fromAddress.split("@")[1]!
    const { zoneId, access } = await accessOf(input.accountId, apiToken, domain)
    if (access.sending === false)
      throw new ConvexError(`Email Sending isn't turned on for ${domain} in Cloudflare yet.`)
    const details: typeof Details.infer = {
      accountId: input.accountId,
      fromAddress: input.fromAddress,
      zoneId,
    }
    await ctx.runMutation(internal.email.save, {
      userId,
      details: await seal(k, JSON.stringify(details), aad.details(userId)),
      token: saved ? saved.token : await seal(k, apiToken, aad.token(userId)),
      tokenAddedAt: saved ? saved.tokenAddedAt : Date.now(),
      access,
    })
    return null
  },
})

const disconnect = authedMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const row = await ctx.db
      .query("emailConnections")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
      .unique()
    if (row) await ctx.db.delete("emailConnections", row._id)
    return null
  },
})

const setAllow = arkMutation({
  args: type({ key: type.enumerated(...allowKeys), value: "boolean" }),
  returns: v.null(),
  handler: async (ctx, { key, value }) => {
    const row = await ctx.db
      .query("emailConnections")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
      .unique()
    if (!row) throw new ConvexError("Connect Cloudflare first.")
    await ctx.db.patch("emailConnections", row._id, { allow: { ...row.allow, [key]: value } })
    return null
  },
})

// Sends a short email to the person's own address, or to the sending address when
// their profile has none. Sealing needs real randomness, so this is an action: it
// opens the token in memory, stores the sealed message, and sends it straight away.
const sendTest = action({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const userId = await userIdOf(ctx)
    const row = await ctx.runQuery(internal.email.sealed, { userId })
    if (!row) throw new ConvexError("Connect Cloudflare first.")
    if (!row.allow.send) throw new ConvexError("Turn on “Send email” first.")
    const { ok } = await limits.limit(ctx, "testEmail", { key: userId })
    if (!ok) throw new ConvexError("That's 5 test emails this hour. Try again later.")
    const k = await secretKeys()
    const details = await openJson(k, row.details, aad.details(userId), Details)
    const apiToken = await open(k, row.token, aad.token(userId)).catch(() => null)
    if (!details || !apiToken)
      throw new ConvexError("The saved connection couldn't be read. Paste your token again.")
    const email = {
      from: details.fromAddress,
      to: [row.userEmail || details.fromAddress],
      subject: "Job Tracking Helper can send from your domain",
      text: `This test came from ${details.fromAddress} through your Cloudflare account. You're all set.`,
    }
    const sealEmail = (value: object) => seal(k, JSON.stringify(value), aad.email(userId))
    const emailId = await ctx.runMutation(components.cloudflareEmail.lib.queue, {
      owner: userId,
      payload: await sealEmail(email),
    })
    const { messageId, error } = await ctx.runAction(components.cloudflareEmail.lib.send, {
      accountId: details.accountId,
      apiToken,
      email,
    })
    await ctx.runMutation(components.cloudflareEmail.lib.markResult, {
      emailId,
      failed: error !== undefined,
      // Cloudflare's Message-ID, kept for threading replies.
      payload: messageId ? await sealEmail({ ...email, messageId }) : undefined,
      error: error && (await seal(k, error, aad.email(userId))),
    })
    return null
  },
})

export const publicApi = { connection, connect, disconnect, setAllow, sendTest }
