import { v } from "convex/values"
import { components, internal } from "../../_generated/api"
import { internalAction, internalMutation, internalQuery } from "../../_generated/server"
import { seal } from "../../lib/secrets"
import { aad as emailAad, keys, openJson, threadKeyOf } from "../email/utils"
import { Details, Received } from "../email/validators"
import { isContact } from "./rules"
import type { ContactDetails } from "./validators"

export const contactAad = (userId: string) => `contact:${userId}`

// What learning from one email needs.
const learnContext = internalQuery({
  args: { eventId: v.id("mailEvents") },
  returns: v.union(
    v.null(),
    v.object({
      userId: v.id("users"),
      applicationId: v.id("applications"),
      company: v.string(),
      sent: v.boolean(),
      at: v.number(),
      payload: v.string(),
      connection: v.optional(v.string()),
      userEmail: v.optional(v.string()),
    })
  ),
  handler: async (ctx, { eventId }) => {
    const event = await ctx.db.get("mailEvents", eventId)
    const application =
      event?.applicationId && (await ctx.db.get("applications", event.applicationId))
    if (!event || !application) return null
    const email = await ctx.runQuery(components.cloudflareEmail.lib.get, { emailId: event.emailId })
    if (!email) return null
    const connection = await ctx.db
      .query("emailConnections")
      .withIndex("by_userId", (q) => q.eq("userId", event.userId))
      .unique()
    const user = await ctx.db.get("users", event.userId)
    return {
      userId: event.userId,
      applicationId: application._id,
      company: application.company,
      sent: event.by === "sent",
      at: event.at,
      payload: email.payload,
      ...(connection && { connection: connection.details }),
      ...(user?.email && { userEmail: user.email }),
    }
  },
})

// Scheduled with only the id, whenever an email lands on an application. Mail you sent teaches
// the app who you wrote to; mail you got teaches it who wrote.
const learn = internalAction({
  args: { eventId: v.id("mailEvents") },
  returns: v.null(),
  handler: async (ctx, { eventId }) => {
    const context = await ctx.runQuery(internal.api.contacts.learnContext, { eventId })
    if (!context) return null
    const k = await keys()
    const { userId } = context
    const mail = await openJson(k, context.payload, emailAad.email(userId), Received)
    if (!mail) return null
    const connection =
      context.connection &&
      (await openJson(k, context.connection, emailAad.details(userId), Details))
    const own = [
      ...(connection ? [connection.fromAddress] : []),
      ...(context.userEmail ? [context.userEmail] : []),
    ]
    const email = context.sent ? mail.to[0] : mail.from
    if (!email || !isContact(email, own)) return null
    const details: ContactDetails = {
      company: context.company,
      name: context.sent ? "" : (mail.fromName ?? ""),
      email: email.toLowerCase(),
      title: "",
      phone: "",
      notes: "",
    }
    await ctx.runMutation(internal.api.contacts.learned, {
      userId,
      key: await threadKeyOf(userId, email.toLowerCase()),
      details: await seal(k, JSON.stringify(details), contactAad(userId)),
      // Writing to someone says nothing new about their name.
      keepName: context.sent,
      applicationId: context.applicationId,
      at: context.at,
    })
    return null
  },
})

const learned = internalMutation({
  args: {
    userId: v.id("users"),
    key: v.string(),
    details: v.string(),
    keepName: v.boolean(),
    applicationId: v.id("applications"),
    at: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, { userId, key, details, keepName, applicationId, at }) => {
    const known = await ctx.db
      .query("contacts")
      .withIndex("by_userId_and_key", (q) => q.eq("userId", userId).eq("key", key))
      .first()
    if (!known) {
      await ctx.db.insert("contacts", { userId, key, details, count: 1, lastAt: at, applicationId })
      return null
    }
    await ctx.db.patch("contacts", known._id, {
      count: known.count + 1,
      lastAt: Math.max(known.lastAt, at),
      ...(!known.edited && !keepName && { details, applicationId }),
    })
    return null
  },
})

// You added or changed one. An address you removed earlier is fine to use again.
const store = internalMutation({
  args: {
    userId: v.id("users"),
    id: v.optional(v.id("contacts")),
    key: v.string(),
    details: v.string(),
  },
  returns: v.union(v.literal("saved"), v.literal("taken"), v.literal("gone")),
  handler: async (ctx, { userId, id, key, details }) => {
    const same = await ctx.db
      .query("contacts")
      .withIndex("by_userId_and_key", (q) => q.eq("userId", userId).eq("key", key))
      .first()
    if (same && same._id !== id) {
      if (!same.hidden) return "taken"
      await ctx.db.delete("contacts", same._id)
    }
    if (!id) {
      await ctx.db.insert("contacts", {
        userId,
        key,
        details,
        count: 0,
        lastAt: Date.now(),
        edited: true,
      })
      return "saved"
    }
    const row = await ctx.db.get("contacts", id)
    if (row?.userId !== userId) return "gone"
    await ctx.db.patch("contacts", id, { key, details, edited: true })
    return "saved"
  },
})

const contactsPage = internalQuery({
  args: { cursor: v.union(v.string(), v.null()) },
  returns: v.object({
    page: v.array(v.object({ id: v.id("contacts"), userId: v.id("users"), details: v.string() })),
    isDone: v.boolean(),
    continueCursor: v.string(),
  }),
  handler: async (ctx, { cursor }) => {
    const result = await ctx.db.query("contacts").paginate({ cursor, numItems: 100 })
    return {
      page: result.page.map((c) => ({ id: c._id, userId: c.userId, details: c.details })),
      isDone: result.isDone,
      continueCursor: result.continueCursor,
    }
  },
})

const resealContact = internalMutation({
  args: { id: v.id("contacts"), from: v.string(), details: v.string() },
  returns: v.null(),
  handler: async (ctx, { id, from, details }) => {
    const row = await ctx.db.get("contacts", id)
    // Skip one edited while this ran.
    if (row?.details === from) await ctx.db.patch("contacts", id, { details })
    return null
  },
})

export const internalApi = { learnContext, learn, learned, store, contactsPage, resealContact }
