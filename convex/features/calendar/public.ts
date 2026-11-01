import { ConvexError, v } from "convex/values"
import { docOf } from "../../lib/docs"
import { calendarEventsTable } from "./models"
import { arkOutputToConvex } from "../../lib/ark"
import { arkMutation, authedMutation, authedQuery } from "../../lib/functions"
import { ruleMatch } from "../email/match"
import { CalendarSettings, maxEvents, SaveEvent, SaveSettings } from "./validators"
import { kindOf, byKey } from "./utils"
import { logEdit } from "../activity/utils"

// Your events, or with two days the ones that can show between them. A repeating event can
// start long before and still fall here, and a fix hides the worked-out event it replaces
// wherever the fix itself has moved to, so those come whatever their dates. Times are
// compared as text: `end` and `start` carry their own offset, so a range should leave room.
const list = authedQuery({
  args: { from: v.optional(v.string()), to: v.optional(v.string()) },
  returns: v.array(docOf("calendarEvents", calendarEventsTable)),
  handler: async (ctx, { from, to }) => {
    if (from === undefined || to === undefined)
      return ctx.db
        .query("calendarEvents")
        .withIndex("by_userId_and_key", (q) => q.eq("userId", ctx.userId))
        .take(maxEvents)
    const rows = await Promise.all([
      ctx.db
        .query("calendarEvents")
        .withIndex("by_userId_and_end", (q) => q.eq("userId", ctx.userId).gte("end", from))
        .filter((q) => q.lt(q.field("start"), to))
        .take(maxEvents),
      ctx.db
        .query("calendarEvents")
        .withIndex("by_userId_and_replaces", (q) => q.eq("userId", ctx.userId).gte("replaces", ""))
        .take(maxEvents),
      ctx.db
        .query("calendarEvents")
        .withIndex("by_userId_and_rrule", (q) => q.eq("userId", ctx.userId).gte("rrule", ""))
        .take(maxEvents),
    ])
    return [...new Map(rows.flat().map((row) => [row._id, row])).values()]
  },
})

const save = arkMutation({
  args: SaveEvent,
  returns: v.null(),
  handler: async (ctx, event) => {
    const title = event.title || "Untitled"
    const existing = await byKey(ctx, ctx.userId, event.key)
    let applicationId = event.applicationId
    if (applicationId) {
      const application = await ctx.db.get("applications", applicationId)
      if (application?.userId !== ctx.userId) throw new ConvexError("That application isn't yours.")
    } else if (!event.replaces && existing?.title !== title) {
      const applications = await ctx.db
        .query("applications")
        .withIndex("by_userId_and_trashedAt", (q) =>
          q.eq("userId", ctx.userId).eq("trashedAt", undefined)
        )
        .order("desc")
        .take(1000)
      const match = ruleMatch(
        { from: "", subject: title },
        applications.map((a) => ({ ...a, id: a._id, at: a._creationTime }))
      )
      applicationId = applications.find((a) => a._id === match?.id)?._id
    }
    const row = {
      ...event,
      title,
      applicationId,
      kind: event.kind ?? (existing?.title === title ? existing.kind : kindOf(title)),
    }
    if (existing) {
      await ctx.db.replace("calendarEvents", existing._id, { ...row, userId: ctx.userId })
      await logEdit(ctx, ctx.userId, "calendar.save", "Changed a calendar event")
      return null
    }
    const count = await ctx.db
      .query("calendarEvents")
      .withIndex("by_userId_and_key", (q) => q.eq("userId", ctx.userId))
      .take(maxEvents)
    if (count.length >= maxEvents) throw new ConvexError(`You can keep ${maxEvents} events.`)
    await ctx.db.insert("calendarEvents", { ...row, userId: ctx.userId })
    await logEdit(ctx, ctx.userId, "calendar.save", "Added a calendar event")
    return null
  },
})

const remove = authedMutation({
  args: { key: v.string() },
  returns: v.null(),
  handler: async (ctx, { key }) => {
    const existing = await byKey(ctx, ctx.userId, key)
    if (!existing) return null
    if (existing.replaces) await ctx.db.patch("calendarEvents", existing._id, { hidden: true })
    else await ctx.db.delete("calendarEvents", existing._id)
    await logEdit(ctx, ctx.userId, "calendar.remove", "Removed a calendar event")
    return null
  },
})

const settings = authedQuery({
  args: {},
  returns: arkOutputToConvex(CalendarSettings),
  handler: async (ctx) => {
    const row = await ctx.db
      .query("calendarSettings")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
      .unique()
    if (!row) return {}
    const { _id, _creationTime, userId: _userId, ...rest } = row
    return rest
  },
})

const saveSettings = arkMutation({
  args: SaveSettings,
  returns: v.null(),
  handler: async (ctx, settings) => {
    const row = await ctx.db
      .query("calendarSettings")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
      .unique()
    if (row) await ctx.db.replace("calendarSettings", row._id, { ...settings, userId: ctx.userId })
    else await ctx.db.insert("calendarSettings", { ...settings, userId: ctx.userId })
    await logEdit(ctx, ctx.userId, "calendar.settings", "Changed your calendar settings")
    return null
  },
})

export const calendarApi = { list, save, remove, settings, saveSettings }
