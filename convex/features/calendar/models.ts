import { defineTable } from "convex/server"
import { v } from "convex/values"

export const eventKinds = ["interview", "followup", "reminder"] as const
export type EventKind = (typeof eventKinds)[number]

// An event you add on the Calendar, or your fix to one the app worked out (an interview
// slot from an email, a follow-up): `replaces` names that one, and `hidden` removes it.
// `key` is the id the calendar gave it, so it keeps one id from the first draw on.
export const vEventFields = {
  key: v.string(),
  title: v.string(),
  // Offset-qualified instants ("2026-11-03T10:30:00+01:00"), or dates when all-day.
  start: v.string(),
  end: v.string(),
  allDay: v.boolean(),
  kind: v.optional(v.union(...eventKinds.map((k) => v.literal(k)))),
  applicationId: v.optional(v.id("applications")),
  replaces: v.optional(v.string()),
  hidden: v.optional(v.boolean()),
  // The rest of what kloq's event panel edits, kept as kloq has it.
  location: v.optional(v.string()),
  description: v.optional(v.string()),
  meetingUrl: v.optional(v.string()),
  color: v.optional(
    v.union(...(["blue", "violet", "emerald", "amber", "rose"] as const).map((c) => v.literal(c)))
  ),
  busy: v.optional(v.boolean()),
  // The zone it was set in, as an invite gives it ("America/New_York").
  timeZone: v.optional(v.string()),
  rrule: v.optional(v.string()),
  exdates: v.optional(v.array(v.string())),
  reminders: v.optional(
    v.array(
      v.object({
        minutesBefore: v.number(),
        method: v.optional(v.union(v.literal("popup"), v.literal("email"))),
      })
    )
  ),
  attendees: v.optional(
    v.array(
      v.object({
        email: v.string(),
        name: v.optional(v.string()),
        status: v.optional(
          v.union(
            v.literal("accepted"),
            v.literal("declined"),
            v.literal("tentative"),
            v.literal("pending")
          )
        ),
        optional: v.optional(v.boolean()),
      })
    )
  ),
}

export const calendarEventsTable = defineTable({
  userId: v.id("users"),
  ...vEventFields,
  kind: v.union(...eventKinds.map((k) => v.literal(k))),
  // Set by the server when a guest books it on one of your booking pages.
  bookingPageId: v.optional(v.id("bookingPages")),
})
  .index("by_userId_and_key", ["userId", "key"])
  // An application's events, to unlink them when it's deleted.
  .index("by_userId_and_applicationId", ["userId", "applicationId"])

// How someone reads their calendar. Unset fields follow the browser and kloq's defaults.
export const vCalendarSettings = {
  timeZone: v.optional(v.string()),
  hour12: v.optional(v.boolean()),
  weekStartsOn: v.optional(v.union(v.literal(0), v.literal(1), v.literal(6))),
  dayStartHour: v.optional(v.number()),
  dayEndHour: v.optional(v.number()),
  // Other zones to show beside the hours, like a company's.
  extraTimeZones: v.optional(v.array(v.string())),
}

export const calendarSettingsTable = defineTable({
  userId: v.id("users"),
  ...vCalendarSettings,
}).index("by_userId", ["userId"])
