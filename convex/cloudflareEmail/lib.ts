// Cloudflare Email Service for Convex, adapted from @sarant/cloudflare-email so each
// person sends with their own Cloudflare account and the app can encrypt every message.
//
// send:    app action → queue(payload) → send(email, token) → markResult(error)
// receive: Email Routing → Worker → app HTTP action → receive(payload)
//
// The component stores only opaque payloads, and the message and token reach send()
// as arguments from an action. Scheduled functions keep their arguments, so nothing
// here schedules with a token or a message.
import { v } from "convex/values"
import { action, mutation, query } from "./_generated/server"
import schema, { vEmail } from "./schema"

const emailDoc = schema.doc("emails")
const direction = v.union(v.literal("inbound"), v.literal("outbound"))

export const queue = mutation({
  args: { owner: v.string(), payload: v.string() },
  returns: v.id("emails"),
  handler: (ctx, { owner, payload }) =>
    ctx.db.insert("emails", { owner, payload, direction: "outbound", status: "queued" }),
})

// shortcut: one attempt, no retry on 429/5xx; retry with backoff once sends are frequent.
/** Sends through Cloudflare and returns its Message-ID, or why it failed. Stores nothing. */
export const send = action({
  args: { accountId: v.string(), apiToken: v.string(), email: vEmail },
  returns: v.object({ messageId: v.optional(v.string()), error: v.optional(v.string()) }),
  handler: async (_ctx, { accountId, apiToken, email: { replyTo, ...email } }) => {
    if (email.to.length === 0) return { error: "`to` must not be empty" }
    if (!email.text && !email.html) return { error: "One of `text` or `html` is required" }
    try {
      const res = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/email/sending/send`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${apiToken}`, "Content-Type": "application/json" },
          // The REST API names it reply_to.
          body: JSON.stringify({ ...email, reply_to: replyTo }),
        }
      )
      const body = (await res.json().catch(() => null)) as {
        success?: boolean
        errors?: { message: string }[]
        result?: { message_id?: string }
      } | null
      if (!res.ok || !body?.success)
        return { error: body?.errors?.map((e) => e.message).join("; ") || `HTTP ${res.status}` }
      return { messageId: body.result?.message_id }
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) }
    }
  },
})

export const markResult = mutation({
  args: {
    emailId: v.id("emails"),
    failed: v.boolean(),
    payload: v.optional(v.string()),
    error: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, { emailId, failed, payload, error }) => {
    await ctx.db.patch("emails", emailId, {
      status: failed ? "failed" : "sent",
      error,
      ...(payload && { payload }),
    })
    return null
  },
})

export const receive = mutation({
  args: { owner: v.string(), payload: v.string() },
  returns: v.id("emails"),
  handler: (ctx, { owner, payload }) =>
    ctx.db.insert("emails", { owner, payload, direction: "inbound", status: "received" }),
})

export const get = query({
  args: { emailId: v.id("emails") },
  returns: v.union(v.null(), emailDoc),
  handler: (ctx, { emailId }) => ctx.db.get("emails", emailId),
})

export const list = query({
  args: { owner: v.string(), direction, limit: v.optional(v.number()) },
  returns: v.array(emailDoc),
  handler: (ctx, { owner, direction, limit }) =>
    ctx.db
      .query("emails")
      .withIndex("by_owner_and_direction", (q) => q.eq("owner", owner).eq("direction", direction))
      .order("desc")
      .take(Math.min(limit ?? 50, 500)),
})

// Every email, a page at a time, so the app can re-encrypt them under a new key.
export const page = query({
  args: { cursor: v.union(v.string(), v.null()) },
  returns: v.object({
    page: v.array(
      v.object({
        _id: v.id("emails"),
        owner: v.string(),
        payload: v.string(),
        error: v.optional(v.string()),
      })
    ),
    isDone: v.boolean(),
    continueCursor: v.string(),
  }),
  handler: async (ctx, { cursor }) => {
    const result = await ctx.db.query("emails").paginate({ cursor, numItems: 100 })
    return {
      ...result,
      page: result.page.map(({ _id, owner, payload, error }) => ({ _id, owner, payload, error })),
    }
  },
})

export const reseal = mutation({
  args: {
    emailId: v.id("emails"),
    from: v.string(),
    payload: v.string(),
    error: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, { emailId, from, payload, error }) => {
    const email = await ctx.db.get("emails", emailId)
    // Skip an email that changed while the app re-encrypted it.
    if (email?.payload === from) await ctx.db.patch("emails", emailId, { payload, error })
    return null
  },
})

// Deletes up to `limit` of an owner's emails and says whether any are left.
export const removeOwner = mutation({
  args: { owner: v.string(), limit: v.optional(v.number()) },
  returns: v.boolean(),
  handler: async (ctx, { owner, limit = 500 }) => {
    const emails = await ctx.db
      .query("emails")
      .withIndex("by_owner_and_direction", (q) => q.eq("owner", owner))
      .take(limit + 1)
    for (const email of emails.slice(0, limit)) await ctx.db.delete("emails", email._id)
    return emails.length > limit
  },
})
