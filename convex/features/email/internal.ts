import { type, type Type } from "arktype"
import { v } from "convex/values"
import { components, internal } from "../../_generated/api"
import type { Id } from "../../_generated/dataModel"
import {
  env,
  internalAction,
  internalMutation,
  internalQuery,
  type MutationCtx,
  type QueryCtx,
} from "../../_generated/server"
import { arkOutputToConvex } from "../../lib/ark"
import { isStale, type Keys, open, parseKeys, seal } from "../../lib/secrets"
import { Allow, EmailConnection, Inbound, nothingAllowed } from "./models"

// Each sealed value is bound to its owner and what it is, so it can't be opened from
// another person's row or passed off as a different field.
export const aad = {
  token: (userId: string) => `email-token:${userId}`,
  details: (userId: string) => `email-details:${userId}`,
  email: (userId: string) => `email:${userId}`,
}
export const keys = () => parseKeys(env.SECRETS_KEYS)

/** Opens a sealed JSON value and checks its shape, or null when it can't be read. */
export const openJson = async <T extends Type>(
  k: Keys,
  sealed: string,
  aadText: string,
  shape: T
) =>
  open(k, sealed, aadText).then(
    (text) => {
      const value = shape(JSON.parse(text))
      return value instanceof type.errors ? null : (value as T["infer"])
    },
    () => null
  )

const connectionOf = (ctx: QueryCtx, userId: Id<"users">) =>
  ctx.db
    .query("emailConnections")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .unique()

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
  returns: v.union(
    v.null(),
    v.object({
      details: v.string(),
      token: v.string(),
      tokenAddedAt: v.number(),
      allow: arkOutputToConvex(Allow),
      inbound: v.optional(arkOutputToConvex(Inbound)),
      userEmail: v.optional(v.string()),
    })
  ),
  handler: async (ctx, { userId }) => {
    const connection = await connectionOf(ctx, userId)
    if (!connection) return null
    const user = await ctx.db.get("users", userId)
    const { details, token, tokenAddedAt, allow, inbound } = connection
    return { details, token, tokenAddedAt, allow, inbound, userEmail: user?.email }
  },
})

// Records incoming mail as set up, or clears it when both are left out.
const setInbound = internalMutation({
  args: {
    userId: v.id("users"),
    inboundId: v.optional(v.string()),
    inbound: v.optional(arkOutputToConvex(Inbound)),
  },
  returns: v.null(),
  handler: async (ctx, { userId, inboundId, inbound }) => {
    const connection = await connectionOf(ctx, userId)
    if (connection) await ctx.db.patch("emailConnections", connection._id, { inboundId, inbound })
    return null
  },
})

// Who an inbound URL belongs to, for the HTTP endpoint to check the Worker's secret.
const inboundTarget = internalQuery({
  args: { inboundId: v.string() },
  returns: v.union(
    v.null(),
    v.object({ userId: v.id("users"), secretHash: v.string(), receive: v.boolean() })
  ),
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
  returns: v.object({
    page: v.array(v.object({ userId: v.id("users"), details: v.string(), token: v.string() })),
    isDone: v.boolean(),
    continueCursor: v.string(),
  }),
  handler: async (ctx, { cursor }) => {
    const result = await ctx.db.query("emailConnections").paginate({ cursor, numItems: 100 })
    return {
      ...result,
      page: result.page.map(({ userId, details, token }) => ({ userId, details, token })),
    }
  },
})

const resealConnection = internalMutation({
  args: {
    userId: v.id("users"),
    from: v.string(),
    details: v.string(),
    token: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, { userId, from, details, token }) => {
    const connection = await connectionOf(ctx, userId)
    // Skip a token that was replaced while this ran.
    if (connection?.token === from)
      await ctx.db.patch("emailConnections", connection._id, { details, token })
    return null
  },
})

const reseal = async (k: Keys, sealedText: string, aadText: string) =>
  seal(k, await open(k, sealedText, aadText), aadText)

// After adding a key to the end of SECRETS_KEYS, run `npx convex run email:resealAll`
// to move every connection and email to it. Then the old key can be removed.
const resealAll = internalAction({
  args: {},
  returns: v.object({ connections: v.number(), emails: v.number() }),
  handler: async (ctx) => {
    const k = await keys()
    const done = { connections: 0, emails: 0 }
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

// For account deletion: the connection now, the emails in batches.
export const deleteEmail = async (ctx: MutationCtx, userId: Id<"users">) => {
  const connection = await connectionOf(ctx, userId)
  if (connection) await ctx.db.delete("emailConnections", connection._id)
  for await (const event of ctx.db
    .query("mailEvents")
    .withIndex("by_userId_and_applicationId", (q) => q.eq("userId", userId)))
    await ctx.db.delete("mailEvents", event._id)
  await ctx.scheduler.runAfter(0, internal.email.removeEmails, { owner: userId })
}

export const internalApi = {
  save,
  sealed,
  setInbound,
  inboundTarget,
  remove,
  connectionsPage,
  resealConnection,
  resealAll,
  removeEmails,
}
