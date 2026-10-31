import { paginationOptsValidator, paginationResultValidator } from "convex/server"
import { v } from "convex/values"
import { internalMutation, internalQuery } from "../../_generated/server"
import { arkOutputToConvex } from "../../lib/ark"
import { authedQuery } from "../../lib/functions"
import schema from "../../schema"
import { startDelete } from "../deletes/utils"
import { ActivityEvent } from "./validators"

const day = 24 * 60 * 60 * 1000
const keepFor = 90 * day

const page = authedQuery({
  args: { failed: v.optional(v.boolean()), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(schema.doc("activityEvents")),
  handler: async (ctx, { failed, paginationOpts }) => {
    const rows = failed
      ? ctx.db
          .query("activityEvents")
          .withIndex("by_userId_and_failed_and_at", (q) =>
            q.eq("userId", ctx.userId).eq("failed", true)
          )
      : ctx.db
          .query("activityEvents")
          .withIndex("by_userId_and_at", (q) => q.eq("userId", ctx.userId))
    return rows.order("desc").paginate(paginationOpts)
  },
})

const joinedAt = authedQuery({
  args: {},
  returns: v.union(v.number(), v.null()),
  handler: async (ctx) => (await ctx.db.get("users", ctx.userId))?._creationTime ?? null,
})

const record = internalMutation({
  args: { event: arkOutputToConvex(ActivityEvent) },
  returns: v.null(),
  handler: async (ctx, { event }) => {
    await ctx.db.insert("activityEvents", event)
    return null
  },
})

// For whoever runs the app: `npx convex run api/activity:failures`. Each person's failures by what
// failed, with the latest reason. shortcut: reads the newest 1000, enough until there are many
// users, then give it a user argument.
const failures = internalQuery({
  args: { days: v.optional(v.number()) },
  returns: v.array(
    v.object({
      userId: v.id("users"),
      work: v.string(),
      count: v.number(),
      lastAt: v.number(),
      lastError: v.optional(v.string()),
    })
  ),
  handler: async (ctx, { days = 7 }) => {
    const rows = await ctx.db
      .query("activityEvents")
      .withIndex("by_failed_and_at", (q) => q.eq("failed", true).gt("at", Date.now() - days * day))
      .order("desc")
      .take(1000)
    const groups = new Map<
      string,
      {
        userId: (typeof rows)[number]["userId"]
        work: string
        count: number
        lastAt: number
        lastError?: string
      }
    >()
    for (const row of rows) {
      const key = `${row.userId}:${row.work}`
      const group = groups.get(key)
      if (group) group.count += 1
      else
        groups.set(key, {
          userId: row.userId,
          work: row.work,
          count: 1,
          lastAt: row.at,
          ...(row.error && { lastError: row.error }),
        })
    }
    return [...groups.values()]
  },
})

const sweep = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    await startDelete(ctx, { kind: "oldActivity", before: Date.now() - keepFor })
    return null
  },
})

export const activityApi = { page, joinedAt, record, failures, sweep }
