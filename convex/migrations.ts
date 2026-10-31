import { v } from "convex/values"
import { internal } from "./_generated/api"
import { internalMutation, internalQuery } from "./_generated/server"
import { fillOldApplications } from "./features/applications/utils"
import { readReview } from "./features/preferences/resumeRules"

// One-off: makes old rows match the shapes the schema is about to require. Safe to run again.
// Run it on each deployment, check `leftovers` says zero, then deploy the narrower schema.
//   npx convex run migrations:run
//   npx convex run migrations:leftovers
// Delete this file once that's done everywhere.

const pageSize = 50

/** Numbers, history and the counter for applications, and retired switches on users. */
const users = internalMutation({
  args: { cursor: v.union(v.string(), v.null()) },
  returns: v.null(),
  handler: async (ctx, { cursor }) => {
    const page = await ctx.db.query("users").paginate({ cursor, numItems: pageSize })
    for (const user of page.page) {
      const next = await fillOldApplications(ctx, user._id)
      await ctx.db.patch("users", user._id, {
        autoApplyAt: undefined,
        autoApplyDryRun: undefined,
        // Never lowers one: a person could have added an application since the last run.
        ...(next > 1 && { nextApplicationNumber: Math.max(next, user.nextApplicationNumber ?? 0) }),
      })
    }
    if (!page.isDone)
      await ctx.scheduler.runAfter(0, internal.migrations.users, { cursor: page.continueCursor })
    return null
  },
})

/** Old resume reviews hold true or false where new ones say yes or no. */
const reviews = internalMutation({
  args: { cursor: v.union(v.string(), v.null()) },
  returns: v.null(),
  handler: async (ctx, { cursor }) => {
    const page = await ctx.db.query("preferences").paginate({ cursor, numItems: pageSize })
    for (const row of page.page)
      if (row.resumeReview?.shows.some((s) => typeof s.shown === "boolean"))
        await ctx.db.patch("preferences", row._id, { resumeReview: readReview(row.resumeReview) })
    if (!page.isDone)
      await ctx.scheduler.runAfter(0, internal.migrations.reviews, { cursor: page.continueCursor })
    return null
  },
})

/** A question loops stopped asking. */
const loops = internalMutation({
  args: { cursor: v.union(v.string(), v.null()) },
  returns: v.null(),
  handler: async (ctx, { cursor }) => {
    const page = await ctx.db.query("loops").paginate({ cursor, numItems: pageSize })
    for (const loop of page.page)
      if ("digest" in loop.answers) {
        const { digest: _digest, ...answers } = loop.answers
        await ctx.db.patch("loops", loop._id, { answers })
      }
    if (!page.isDone)
      await ctx.scheduler.runAfter(0, internal.migrations.loops, { cursor: page.continueCursor })
    return null
  },
})

const run = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    await ctx.scheduler.runAfter(0, internal.migrations.users, { cursor: null })
    await ctx.scheduler.runAfter(0, internal.migrations.reviews, { cursor: null })
    await ctx.scheduler.runAfter(0, internal.migrations.loops, { cursor: null })
    return null
  },
})

/** What's still in the old shape. All zero means the narrower schema will deploy. */
const leftovers = internalQuery({
  args: {},
  returns: v.object({
    applications: v.number(),
    users: v.number(),
    reviews: v.number(),
    loops: v.number(),
  }),
  handler: async (ctx) => {
    const out = { applications: 0, users: 0, reviews: 0, loops: 0 }
    for await (const a of ctx.db.query("applications"))
      if (a.number === undefined || a.history === undefined) out.applications++
    for await (const u of ctx.db.query("users"))
      if (u.autoApplyAt !== undefined || u.autoApplyDryRun !== undefined) out.users++
    for await (const p of ctx.db.query("preferences"))
      if (p.resumeReview?.shows.some((s) => typeof s.shown === "boolean")) out.reviews++
    for await (const l of ctx.db.query("loops")) if ("digest" in l.answers) out.loops++
    return out
  },
})

export { leftovers, loops, reviews, run, users }
