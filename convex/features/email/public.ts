import { ConvexError, v } from "convex/values"
import { components, internal } from "../../_generated/api"
import { action } from "../../_generated/server"
import { arkToConvex, checked } from "../../lib/ark"
import { authedMutation, authedQuery } from "../../lib/functions"
import { open, seal } from "../../lib/secrets"
import { accessOf, tokenStatus } from "./cloudflare"
import {
  limits,
  openConnection,
  secretKeys,
  outgoing,
  signatureInfoOf,
  userIdOf,
  aad,
  keys,
  openJson,
} from "./utils"
import { allowKeys, Details, Sent, Connect, vConnectionView } from "./validators"
import { logEdit, logEditFromAction } from "../activity/utils"

const connection = authedQuery({
  args: {},
  returns: vConnectionView,
  handler: async (ctx) => {
    const row = await ctx.db
      .query("emailConnections")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
      .unique()
    if (!row) return null
    const k = await keys().catch(() => null)
    const details = k && (await openJson(k, row.details, aad.details(ctx.userId), Details))
    if (!k || !details) return null
    const photoUrl = row.signaturePhoto && (await ctx.storage.getUrl(row.signaturePhoto))
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
      receivingSince: row.inbound?.at ?? null,
      ...(details.forwardTo && { forwardTo: details.forwardTo }),
      tracking: Boolean(row.inbound && row.allow.receive && row.allow.tag),
      ...(photoUrl && { signaturePhotoUrl: photoUrl }),
      signature: await signatureInfoOf(ctx, ctx.userId),
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

const connect = action({
  args: arkToConvex(Connect),
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await userIdOf(ctx)
    const input = checked(Connect, args)
    const { ok } = await limits.limit(ctx, "connectEmail", { key: userId })
    if (!ok) throw new ConvexError("Too many tries. Wait an hour and try again.")
    const k = await secretKeys()
    const saved = await ctx.runQuery(internal.api.email.sealed, { userId })
    const before = saved && (await openJson(k, saved.details, aad.details(userId), Details))
    if (saved?.inbound) {
      if (before?.fromAddress !== input.fromAddress || before.accountId !== input.accountId)
        throw new ConvexError("Stop incoming mail before changing the account or address.")
    }
    const reuse = !input.apiToken && saved
    const apiToken =
      input.apiToken || (reuse && (await open(k, reuse.token, aad.token(userId)).catch(() => null)))
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
      ...(before?.forwardTo && { forwardTo: before.forwardTo }),
    }
    await ctx.runMutation(internal.api.email.save, {
      userId,
      details: await seal(k, JSON.stringify(details), aad.details(userId)),
      token: reuse ? reuse.token : await seal(k, apiToken, aad.token(userId)),
      tokenAddedAt: reuse ? reuse.tokenAddedAt : Date.now(),
      access,
    })
    await logEditFromAction(ctx, userId, "mail.connect", "Connected Cloudflare")
    return null
  },
})

const setAllow = authedMutation({
  args: { key: v.union(...allowKeys.map((k) => v.literal(k))), value: v.boolean() },
  returns: v.null(),
  handler: async (ctx, { key, value }) => {
    const row = await ctx.db
      .query("emailConnections")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
      .unique()
    if (!row) throw new ConvexError("Connect Cloudflare first.")
    await ctx.db.patch("emailConnections", row._id, { allow: { ...row.allow, [key]: value } })
    await logEdit(ctx, ctx.userId, "mail.settings", "Changed an email setting")
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
    const { row, k, details, token: apiToken } = await openConnection(ctx, userId)
    if (!row.allow.send) throw new ConvexError("Turn on “Send email” first.")
    const { ok } = await limits.limit(ctx, "testEmail", { key: userId })
    if (!ok) throw new ConvexError("That's 5 test emails this hour. Try again later.")
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
      email: await outgoing(ctx, row, email),
    })
    await ctx.runMutation(components.cloudflareEmail.lib.markResult, {
      emailId,
      failed: error !== undefined,
      payload: messageId ? await sealEmail({ ...email, messageId }) : undefined,
      error: error && (await seal(k, error, aad.email(userId))),
    })
    await logEditFromAction(
      ctx,
      userId,
      "mail.test",
      error ? "A test email didn't send" : "Sent a test email",
      error ? { failed: error } : {}
    )
    return null
  },
})

const maxSignaturePhotoBytes = 300 * 1024

const setSignaturePhoto = authedMutation({
  args: { photo: v.optional(v.id("_storage")) },
  returns: v.null(),
  handler: async (ctx, { photo }) => {
    const row = await ctx.db
      .query("emailConnections")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
      .unique()
    if (!row) throw new ConvexError("Connect Cloudflare first.")
    if (photo) {
      const file = await ctx.db.system.get("_storage", photo)
      if (!file?.contentType || !["image/jpeg", "image/png"].includes(file.contentType))
        throw new ConvexError("Use a JPEG or PNG photo.")
      if (file.size > maxSignaturePhotoBytes) throw new ConvexError("That photo is too big.")
    }
    if (row.signaturePhoto && row.signaturePhoto !== photo)
      await ctx.storage.delete(row.signaturePhoto)
    await ctx.db.patch("emailConnections", row._id, { signaturePhoto: photo })
    await logEdit(
      ctx,
      ctx.userId,
      "account.signature",
      photo ? "Changed your signature photo" : "Removed your signature photo"
    )
    return null
  },
})

export const publicApi = { connection, connect, setAllow, sendTest, setSignaturePhoto }
