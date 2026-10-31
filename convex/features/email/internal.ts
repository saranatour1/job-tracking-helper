import { v } from "convex/values"
import { components, internal } from "../../_generated/api"
import type { Id } from "../../_generated/dataModel"
import { internalAction, internalMutation, internalQuery } from "../../_generated/server"
import { arkOutputToConvex } from "../../lib/ark"
import { isStale } from "../../lib/secrets"
import {
  EmailConnection,
  nothingAllowed,
  vSealedConnection,
  vSetInboundArgs,
  vInboundTarget,
  vConnectionsPage,
  vResealArgs,
} from "./validators"
import { rowLimits } from "../preferences/rows"
import { aad, keys, connectionOf, reseal } from "./utils"

// Adding a token, or replacing it, writes one row: the old token is gone once this
// commits. A replaced token keeps the switches and incoming mail already set up.
const save = internalMutation({
  args: arkOutputToConvex(EmailConnection.omit("allow", "inboundId", "inbound")),
  returns: v.null(),
  handler: async (ctx, connection) => {
    const existing = await connectionOf(ctx, connection.userId)
    if (existing)
      await ctx.db.replace("emailConnections", existing._id, {
        ...connection,
        allow: existing.allow,
        inboundId: existing.inboundId,
        inbound: existing.inbound,
      })
    else await ctx.db.insert("emailConnections", { ...connection, allow: nothingAllowed })
    return null
  },
})

// The sealed connection and the person's own address, for an action to open.
const sealed = internalQuery({
  args: { userId: v.id("users") },
  returns: vSealedConnection,
  handler: async (ctx, { userId }) => {
    const connection = await connectionOf(ctx, userId)
    if (!connection) return null
    const user = await ctx.db.get("users", userId)
    const fields = await ctx.db
      .query("profileEntries")
      .withIndex("by_userId_and_kind_and_order", (q) => q.eq("userId", userId).eq("kind", "field"))
      .take(rowLimits.field)
    const saved = fields.find((f) => /\bfull name\b/i.test(f.label))?.value.trim()
    const senderName = saved || user?.name
    const { details, token, tokenAddedAt, allow, inbound } = connection
    return {
      details,
      token,
      tokenAddedAt,
      allow,
      inbound,
      userEmail: user?.email,
      ...(senderName && { senderName }),
    }
  },
})

// Records incoming mail as set up, or clears it when both are left out.
const setInbound = internalMutation({
  args: vSetInboundArgs,
  returns: v.null(),
  handler: async (ctx, { userId, inboundId, inbound, details }) => {
    const connection = await connectionOf(ctx, userId)
    if (connection)
      await ctx.db.patch("emailConnections", connection._id, {
        inboundId,
        inbound,
        ...(details && { details }),
      })
    return null
  },
})

// Who an inbound URL belongs to, for the HTTP endpoint to check the Worker's secret.
const inboundTarget = internalQuery({
  args: { inboundId: v.string() },
  returns: vInboundTarget,
  handler: async (ctx, { inboundId }) => {
    const connection = await ctx.db
      .query("emailConnections")
      .withIndex("by_inboundId", (q) => q.eq("inboundId", inboundId))
      .unique()
    return connection?.inbound
      ? {
          userId: connection.userId,
          secretHash: connection.inbound.secretHash,
          receive: connection.allow.receive,
        }
      : null
  },
})

const addAliasRule = internalMutation({
  args: { userId: v.id("users"), ruleId: v.string() },
  returns: v.null(),
  handler: async (ctx, { userId, ruleId }) => {
    const connection = await connectionOf(ctx, userId)
    if (!connection?.inbound) return null
    await ctx.db.patch("emailConnections", connection._id, {
      inbound: {
        ...connection.inbound,
        aliasRules: [...(connection.inbound.aliasRules ?? []), ruleId],
      },
    })
    return null
  },
})

const remove = internalMutation({
  args: { userId: v.id("users") },
  returns: v.null(),
  handler: async (ctx, { userId }) => {
    const connection = await connectionOf(ctx, userId)
    if (connection) await ctx.db.delete("emailConnections", connection._id)
    return null
  },
})

const connectionsPage = internalQuery({
  args: { cursor: v.union(v.string(), v.null()) },
  returns: vConnectionsPage,
  handler: async (ctx, { cursor }) => {
    const result = await ctx.db.query("emailConnections").paginate({ cursor, numItems: 100 })
    return {
      ...result,
      page: result.page.map(({ userId, details, token }) => ({ userId, details, token })),
    }
  },
})

const resealConnection = internalMutation({
  args: vResealArgs,
  returns: v.null(),
  handler: async (ctx, { userId, from, details, token }) => {
    const connection = await connectionOf(ctx, userId)
    // Skip a token that was replaced while this ran.
    if (connection?.token === from)
      await ctx.db.patch("emailConnections", connection._id, { details, token })
    return null
  },
})

// After adding a key to the end of SECRETS_KEYS, run `npx convex run email:resealAll`
// to move every connection and email to it. Then the old key can be removed.
const resealAll = internalAction({
  args: {},
  returns: v.object({ connections: v.number(), emails: v.number(), contacts: v.number() }),
  handler: async (ctx) => {
    const k = await keys()
    const done = { connections: 0, emails: 0, contacts: 0 }
    let cursor: string | null = null
    for (;;) {
      const result: {
        page: { userId: Id<"users">; details: string; token: string }[]
        isDone: boolean
        continueCursor: string
      } = await ctx.runQuery(internal.email.connectionsPage, { cursor })
      for (const row of result.page) {
        if (!isStale(k, row.token) && !isStale(k, row.details)) continue
        await ctx.runMutation(internal.email.resealConnection, {
          userId: row.userId,
          from: row.token,
          details: await reseal(k, row.details, aad.details(row.userId)),
          token: await reseal(k, row.token, aad.token(row.userId)),
        })
        done.connections++
      }
      if (result.isDone) break
      cursor = result.continueCursor
    }
    cursor = null
    for (;;) {
      const result: {
        page: { _id: string; owner: string; payload: string; error?: string }[]
        isDone: boolean
        continueCursor: string
      } = await ctx.runQuery(components.cloudflareEmail.lib.page, { cursor })
      for (const email of result.page) {
        if (!isStale(k, email.payload) && (!email.error || !isStale(k, email.error))) continue
        await ctx.runMutation(components.cloudflareEmail.lib.reseal, {
          emailId: email._id,
          from: email.payload,
          payload: await reseal(k, email.payload, aad.email(email.owner)),
          error: email.error && (await reseal(k, email.error, aad.email(email.owner))),
        })
        done.emails++
      }
      if (result.isDone) break
      cursor = result.continueCursor
    }
    cursor = null
    for (;;) {
      const result: {
        page: { id: Id<"contacts">; userId: string; details: string }[]
        isDone: boolean
        continueCursor: string
      } = await ctx.runQuery(internal.contacts.contactsPage, { cursor })
      for (const contact of result.page) {
        if (!isStale(k, contact.details)) continue
        await ctx.runMutation(internal.contacts.resealContact, {
          id: contact.id,
          from: contact.details,
          details: await reseal(k, contact.details, `contact:${contact.userId}`),
        })
        done.contacts++
      }
      if (result.isDone) return done
      cursor = result.continueCursor
    }
  },
})

const removeEmails = internalMutation({
  args: { owner: v.string() },
  returns: v.null(),
  handler: async (ctx, { owner }) => {
    const more = await ctx.runMutation(components.cloudflareEmail.lib.removeOwner, { owner })
    if (more) await ctx.scheduler.runAfter(0, internal.email.removeEmails, { owner })
    return null
  },
})

export const internalApi = {
  save,
  sealed,
  setInbound,
  inboundTarget,
  addAliasRule,
  remove,
  connectionsPage,
  resealConnection,
  resealAll,
  removeEmails,
}
