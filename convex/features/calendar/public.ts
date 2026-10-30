import { ConvexError, v } from "convex/values"
import schema from "../../schema"
import { arkOutputToConvex } from "../../lib/ark"
import { arkMutation, authedMutation, authedQuery } from "../../lib/functions"
import { ruleMatch } from "../email/match"
import { CalendarSettings, maxEvents, SaveEvent, SaveSettings } from "./validators"
import { kindOf, byKey } from "./utils"

const list = authedQuery({
  args: {},
  returns: v.array(schema.doc("calendarEvents")),
  handler: (ctx) =>
    ctx.db
      .query("calendarEvents")
      .withIndex("by_userId_and_key", (q) => q.eq("userId", ctx.userId))
      .take(maxEvents),
})

/** Adds an event, or changes the one with this key. */
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
      // Like mail, an event whose new title names one company goes under that application.
      // shortcut: reads all of a person's applications; fine for a job search's few hundred.
      const applications = (
        await ctx.db
          .query("applications")
          .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
          .take(1000)
      ).filter((a) => a.trashedAt === undefined)
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
      // A long-running series keeps its newest exceptions.
      exdates: event.exdates?.slice(-200),
    }
    if (existing) {
      await ctx.db.replace("calendarEvents", existing._id, {
        ...row,
        userId: ctx.userId,
        bookingPageId: existing.bookingPageId,
      })
      return null
    }
    const count = await ctx.db
      .query("calendarEvents")
      .withIndex("by_userId_and_key", (q) => q.eq("userId", ctx.userId))
      .take(maxEvents)
    if (count.length >= maxEvents) throw new ConvexError(`You can keep ${maxEvents} events.`)
    await ctx.db.insert("calendarEvents", { ...row, userId: ctx.userId })
    return null
  },
})

/** Deletes your event. A fix to one the app worked out stays, hiding that one. */
const remove = authedMutation({
  args: { key: v.string() },
  returns: v.null(),
  handler: async (ctx, { key }) => {
    const existing = await byKey(ctx, ctx.userId, key)
    if (!existing) return null
    if (existing.replaces) await ctx.db.patch("calendarEvents", existing._id, { hidden: true })
    else await ctx.db.delete("calendarEvents", existing._id)
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

/** Replaces your calendar settings; a field left out goes back to its default. */
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
    return null
  },
})

export const calendarApi = { list, save, remove, settings, saveSettings }
