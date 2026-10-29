import { ConvexError, v } from "convex/values"
import schema from "../../../schema"
import type { Id } from "../../../_generated/dataModel"
import type { MutationCtx } from "../../../_generated/server"
import { authedMutation, authedQuery } from "../../../lib/functions"
import { ruleMatch } from "../email/match"
import { type EventKind, vCalendarSettings, vEventFields } from "./models"

// Plenty for a job search, and few enough to send in one go.
const maxEvents = 500

const instant = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?(Z|[+-]\d{2}:\d{2}))?$/
const dateOnly = /^\d{4}-\d{2}-\d{2}$/

/** The kind a title suggests, for events added without one. */
export const kindOf = (title: string): EventKind =>
  /interview|screen|call|onsite|round/i.test(title)
    ? "interview"
    : /follow.?up/i.test(title)
      ? "followup"
      : "reminder"

const list = authedQuery({
  args: {},
  returns: v.array(schema.doc("calendarEvents")),
  handler: (ctx) =>
    ctx.db
      .query("calendarEvents")
      .withIndex("by_userId_and_key", (q) => q.eq("userId", ctx.userId))
      .take(maxEvents),
})

const byKey = (ctx: MutationCtx, userId: Id<"users">, key: string) =>
  ctx.db
    .query("calendarEvents")
    .withIndex("by_userId_and_key", (q) => q.eq("userId", userId).eq("key", key))
    .unique()

/** Adds an event, or changes the one with this key. */
const save = authedMutation({
  args: vEventFields,
  returns: v.null(),
  handler: async (ctx, event) => {
    // Checked here, since anyone can call this with anything.
    const title = event.title.trim().slice(0, 200) || "Untitled"
    const shape = event.allDay ? dateOnly : instant
    if (!shape.test(event.start) || !shape.test(event.end) || event.key.length > 100)
      throw new ConvexError("That event's time isn't one the calendar can read.")
    if (Date.parse(event.end) < Date.parse(event.start))
      throw new ConvexError("An event can't end before it starts.")
    const existing = await byKey(ctx, ctx.userId, event.key)
    let applicationId = event.applicationId
    if (applicationId) {
      const application = await ctx.db.get("applications", applicationId)
      if (application?.userId !== ctx.userId) throw new ConvexError("That application isn't yours.")
    } else if (!event.replaces && existing?.title !== title) {
      // Like mail, an event whose new title names one company goes under that application.
      // shortcut: reads all of a person's applications; fine for a job search's few hundred.
      const applications = await ctx.db
        .query("applications")
        .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
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
      location: event.location?.slice(0, 200),
      description: event.description?.slice(0, 2000),
      meetingUrl: event.meetingUrl?.slice(0, 500),
      rrule: event.rrule?.slice(0, 300),
      exdates: event.exdates?.slice(-200),
      reminders: event.reminders?.slice(0, 10),
      attendees: event.attendees?.slice(0, 50),
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
  returns: v.object(vCalendarSettings),
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
const saveSettings = authedMutation({
  args: vCalendarSettings,
  returns: v.null(),
  handler: async (ctx, settings) => {
    if ((settings.extraTimeZones?.length ?? 0) > 3)
      throw new ConvexError("Show up to 3 other time zones.")
    for (const zone of [settings.timeZone, ...(settings.extraTimeZones ?? [])]) {
      if (zone === undefined) continue
      try {
        new Intl.DateTimeFormat("en", { timeZone: zone })
      } catch {
        throw new ConvexError(`${zone} isn't a time zone.`)
      }
    }
    const start = settings.dayStartHour ?? 0
    const end = settings.dayEndHour ?? 24
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end > 24 || start >= end)
      throw new ConvexError("The day has to start before it ends, between 0 and 24.")
    const row = await ctx.db
      .query("calendarSettings")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
      .unique()
    if (row) await ctx.db.replace("calendarSettings", row._id, { ...settings, userId: ctx.userId })
    else await ctx.db.insert("calendarSettings", { ...settings, userId: ctx.userId })
    return null
  },
})

// For account deletion.
export const deleteCalendar = async (ctx: MutationCtx, userId: Id<"users">) => {
  for await (const row of ctx.db
    .query("calendarEvents")
    .withIndex("by_userId_and_key", (q) => q.eq("userId", userId)))
    await ctx.db.delete("calendarEvents", row._id)
  const row = await ctx.db
    .query("calendarSettings")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .unique()
  if (row) await ctx.db.delete("calendarSettings", row._id)
}

export const calendarApi = { list, save, remove, settings, saveSettings }
