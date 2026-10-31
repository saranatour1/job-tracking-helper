import { v } from "convex/values"
import { internal } from "../_generated/api"
import { internalMutation, internalQuery } from "../_generated/server"
import { fitOf } from "../features/applications/utils"
import { syncMailSummary } from "../features/email/utils"
import { countCatalog } from "../features/jobs/utils"

// One-off: puts existing mail in its folder, and marks it read since it isn't new. Safe to run
// again. Run it on each deployment:
//   npx convex run api/migrations:fillBoxes
//   npx convex run api/migrations:boxesLeft
// Delete this file, and make `mailEvents.box` required, once that's done everywhere.
export const fillBoxes = internalMutation({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  returns: v.null(),
  handler: async (ctx, { cursor }) => {
    const page = await ctx.db
      .query("mailEvents")
      .paginate({ cursor: cursor ?? null, numItems: 100 })
    for (const event of page.page)
      if (event.box === undefined)
        await ctx.db.patch("mailEvents", event._id, {
          box: event.by === "sent" ? "sent" : "inbox",
          readAt: event.readAt ?? event.at,
        })
    if (!page.isDone)
      await ctx.scheduler.runAfter(0, internal.api.migrations.fillBoxes, {
        cursor: page.continueCursor,
      })
    return null
  },
})

export const boxesLeft = internalQuery({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    let left = 0
    for await (const event of ctx.db.query("mailEvents")) if (event.box === undefined) left++
    return left
  },
})

// One-off: gives existing applications the mail summary and fit the board now reads off them,
// and counts the job catalog. Until it's run, cards show no mail or fit badge and Jobs no
// totals. Safe to run again. Run it on each deployment:
//   npx convex run api/migrations:fillBoardFields
//   npx convex run api/migrations:boardFieldsLeft
// Delete it once that's done everywhere.
export const fillBoardFields = internalMutation({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  returns: v.null(),
  handler: async (ctx, { cursor }) => {
    if (!cursor) await countCatalog(ctx, {})
    const page = await ctx.db
      .query("applications")
      .paginate({ cursor: cursor ?? null, numItems: 50 })
    for (const application of page.page) {
      await syncMailSummary(ctx, application._id)
      if (application.fit !== undefined) continue
      const lead = await ctx.db
        .query("jobLeads")
        .withIndex("by_applicationId", (q) => q.eq("applicationId", application._id))
        .first()
      if (lead) await ctx.db.patch("applications", application._id, fitOf(lead))
    }
    if (!page.isDone)
      await ctx.scheduler.runAfter(0, internal.api.migrations.fillBoardFields, {
        cursor: page.continueCursor,
      })
    return null
  },
})

// Applications with mail but no summary. Zero once the fill has finished.
export const boardFieldsLeft = internalQuery({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const filled = new Set<string>()
    for await (const application of ctx.db.query("applications"))
      if (application.mail) filled.add(application._id)
    const left = new Set<string>()
    for await (const { applicationId, box } of ctx.db.query("mailEvents"))
      if (applicationId && box !== "trash" && !filled.has(applicationId)) left.add(applicationId)
    return left.size
  },
})
