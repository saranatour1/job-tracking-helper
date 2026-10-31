import { v } from "convex/values"
import { mutation, type MutationCtx, query, type QueryCtx } from "./_generated/server"
import schema from "./schema"

const settingsOf = (ctx: QueryCtx, owner: string) =>
  ctx.db
    .query("settings")
    .withIndex("by_owner", (q) => q.eq("owner", owner))
    .unique()

/** Adds a notification unless the owner muted its kind. Returns its id, or null. */
export const notify = mutation({
  args: {
    owner: v.string(),
    kind: v.string(),
    ref: v.optional(v.string()),
    message: v.optional(v.string()),
  },
  returns: v.union(v.id("notifications"), v.null()),
  handler: async (ctx, { owner, kind, ref, message }) => {
    const settings = await settingsOf(ctx, owner)
    if (settings?.muted.includes(kind)) return null
    return await ctx.db.insert("notifications", { owner, kind, ref, message, at: Date.now() })
  },
})

/** Newest first. */
export const list = query({
  args: { owner: v.string(), limit: v.optional(v.number()) },
  returns: v.array(schema.doc("notifications")),
  handler: (ctx, { owner, limit }) =>
    ctx.db
      .query("notifications")
      .withIndex("by_owner_and_at", (q) => q.eq("owner", owner))
      .order("desc")
      .take(Math.min(limit ?? 100, 500)),
})

/** Unread notifications, counted up to `limit` (the badge shows "99+" past that). */
export const unreadCount = query({
  args: { owner: v.string(), limit: v.optional(v.number()) },
  returns: v.number(),
  handler: async (ctx, { owner, limit = 100 }) =>
    (
      await ctx.db
        .query("notifications")
        .withIndex("by_owner_and_readAt", (q) => q.eq("owner", owner).eq("readAt", undefined))
        .take(limit)
    ).length,
})

/** Removes an owner's notifications whose ref starts with one of `prefixes`, from the
 * newest 1000: the app calls this when the things they point at are deleted. */
export const forget = mutation({
  args: { owner: v.string(), prefixes: v.array(v.string()) },
  returns: v.number(),
  handler: async (ctx, { owner, prefixes }) => {
    if (!prefixes.length) return 0
    const rows = await ctx.db
      .query("notifications")
      .withIndex("by_owner_and_at", (q) => q.eq("owner", owner))
      .order("desc")
      .take(1000)
    let removed = 0
    for (const row of rows)
      if (row.ref && prefixes.some((p) => row.ref!.startsWith(p))) {
        await ctx.db.delete("notifications", row._id)
        removed++
      }
    return removed
  },
})

export const setRead = mutation({
  args: { owner: v.string(), ids: v.optional(v.array(v.id("notifications"))), read: v.boolean() },
  returns: v.null(),
  handler: async (ctx, { owner, ids, read }) => {
    const readAt = read ? Date.now() : undefined
    const rows = ids
      ? await Promise.all(ids.map((id) => ctx.db.get("notifications", id)))
      : await ctx.db
          .query("notifications")
          .withIndex("by_owner_and_readAt", (q) => q.eq("owner", owner).eq("readAt", undefined))
          .take(500)
    for (const row of rows)
      if (row?.owner === owner) await ctx.db.patch("notifications", row._id, { readAt })
    return null
  },
})

export const muted = query({
  args: { owner: v.string() },
  returns: v.array(v.string()),
  handler: async (ctx, { owner }) => (await settingsOf(ctx, owner))?.muted ?? [],
})

export const setMuted = mutation({
  args: { owner: v.string(), kind: v.string(), muted: v.boolean() },
  returns: v.null(),
  handler: async (ctx, { owner, kind, muted }) => {
    const settings = await settingsOf(ctx, owner)
    const next = [
      ...new Set([...(settings?.muted ?? []).filter((k) => k !== kind), ...(muted ? [kind] : [])]),
    ]
    if (settings) await ctx.db.patch("settings", settings._id, { muted: next })
    else await ctx.db.insert("settings", { owner, muted: next })
    return null
  },
})

const removeBatch = async (ctx: MutationCtx, owner: string, limit: number) => {
  const rows = await ctx.db
    .query("notifications")
    .withIndex("by_owner_and_at", (q) => q.eq("owner", owner))
    .take(limit + 1)
  for (const row of rows.slice(0, limit)) await ctx.db.delete("notifications", row._id)
  return rows.length > limit
}

export const removeOwner = mutation({
  args: { owner: v.string(), limit: v.optional(v.number()) },
  returns: v.boolean(),
  handler: async (ctx, { owner, limit = 500 }) => {
    const more = await removeBatch(ctx, owner, limit)
    const settings = more ? null : await settingsOf(ctx, owner)
    if (settings) await ctx.db.delete("settings", settings._id)
    return more
  },
})
