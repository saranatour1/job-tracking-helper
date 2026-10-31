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
import { aad, keys, connectionOf, reseal, signatureInfoOf } from "./utils"

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
        signaturePhoto: existing.signaturePhoto,
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
    const { details, token, tokenAddedAt, allow, inbound, signaturePhoto } = connection
    return {
      details,
      token,
      tokenAddedAt,
      allow,
      inbound,
      signaturePhoto,
      userEmail: user?.email,
      signature: await signatureInfoOf(ctx, userId),
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
    if (connection?.signaturePhoto) await ctx.storage.delete(connection.signaturePhoto)
    if (connection) await ctx.db.delete("emailConnections", connection._id)
    return null
  },
})

const connectionsPage = internalQuery({
  args: { cursor: v.union(v.string(), v.null()) },
  returns: vConnectionsPage,
  handler: async (ctx, { cursor }) => {
    const result = await ctx.db.query("emailConnections").paginate({ cursor, numItems: 100 })
    // Named, since a page also carries fields this doesn't return.
    return {
      isDone: result.isDone,
      continueCursor: result.continueCursor,
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

const notesPage = internalQuery({
  args: { cursor: v.union(v.string(), v.null()) },
  returns: v.object({
    page: v.array(v.object({ id: v.id("mailEvents"), userId: v.id("users"), note: v.string() })),
    isDone: v.boolean(),
    continueCursor: v.string(),
  }),
  handler: async (ctx, { cursor }) => {
    const result = await ctx.db.query("mailEvents").paginate({ cursor, numItems: 100 })
    return {
      page: result.page.map((e) => ({ id: e._id, userId: e.userId, note: e.note })),
      isDone: result.isDone,
      continueCursor: result.continueCursor,
    }
  },
})

const resealNote = internalMutation({
  args: { id: v.id("mailEvents"), from: v.string(), note: v.string() },
  returns: v.null(),
  handler: async (ctx, { id, from, note }) => {
    const event = await ctx.db.get("mailEvents", id)
    // Skip one that changed while this ran.
    if (event?.note === from) await ctx.db.patch("mailEvents", id, { note })
    return null
  },
})

// After adding a key to the end of SECRETS_KEYS, run `npx convex run email:resealAll`
// to move every connection and email to it. Then the old key can be removed.
const resealAll = internalAction({
  args: {},
  returns: v.object({
    connections: v.number(),
    emails: v.number(),
    notes: v.number(),
    contacts: v.number(),
    drafts: v.number(),
  }),
  handler: async (ctx) => {
    const k = await keys()
    const done = { connections: 0, emails: 0, notes: 0, contacts: 0, drafts: 0 }
    let cursor: string | null = null
    for (;;) {
      const result: {
        page: { userId: Id<"users">; details: string; token: string }[]
        isDone: boolean
        continueCursor: string
      } = await ctx.runQuery(internal.api.email.connectionsPage, { cursor })
      for (const row of result.page) {
        if (!isStale(k, row.token) && !isStale(k, row.details)) continue
        await ctx.runMutation(internal.api.email.resealConnection, {
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
        page: { id: Id<"mailEvents">; userId: string; note: string }[]
        isDone: boolean
        continueCursor: string
      } = await ctx.runQuery(internal.api.email.notesPage, { cursor })
      for (const event of result.page) {
        if (!isStale(k, event.note)) continue
        await ctx.runMutation(internal.api.email.resealNote, {
          id: event.id,
          from: event.note,
          note: await reseal(k, event.note, aad.email(event.userId)),
        })
        done.notes++
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
      } = await ctx.runQuery(internal.api.contacts.contactsPage, { cursor })
      for (const contact of result.page) {
        if (!isStale(k, contact.details)) continue
        await ctx.runMutation(internal.api.contacts.resealContact, {
          id: contact.id,
          from: contact.details,
          details: await reseal(k, contact.details, `contact:${contact.userId}`),
        })
        done.contacts++
      }
      if (result.isDone) break
      cursor = result.continueCursor
    }
    cursor = null
    for (;;) {
      const result: {
        page: { id: Id<"mailDrafts">; userId: string; details: string }[]
        isDone: boolean
        continueCursor: string
      } = await ctx.runQuery(internal.api.mailbox.draftsPage, { cursor })
      for (const draft of result.page) {
        if (!isStale(k, draft.details)) continue
        await ctx.runMutation(internal.api.mailbox.resealDraft, {
          id: draft.id,
          from: draft.details,
          details: await reseal(k, draft.details, `mail-draft:${draft.userId}`),
        })
        done.drafts++
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
    if (more) await ctx.scheduler.runAfter(0, internal.api.email.removeEmails, { owner })
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
  notesPage,
  resealNote,
  connectionsPage,
  resealConnection,
  resealAll,
  removeEmails,
}
