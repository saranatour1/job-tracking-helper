import { type } from "arktype"
import { arkId } from "../../lib/ark"
import { isTimeZone } from "../loops/schedule"

export const eventKinds = ["interview", "followup", "reminder"] as const
export type EventKind = (typeof eventKinds)[number]

// Plenty for a job search, and few enough to send in one go.
export const maxEvents = 500

const instant = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?(Z|[+-]\d{2}:\d{2}))?$/
const dateOnly = /^\d{4}-\d{2}-\d{2}$/

// An event you add on the Calendar, or your fix to one the app worked out (an interview
// slot from an email, a follow-up): `replaces` names that one, and `hidden` removes it.
// `key` is the id the calendar gave it, so it keeps one id from the first draw on.
export const EventFields = type({
  key: "string <= 100",
  // Left empty, it's saved as "Untitled".
  title: type("string.trim").to("string <= 200"),
  // Offset-qualified instants ("2026-11-03T10:30:00+01:00"), or dates when all-day.
  start: "string",
  end: "string",
  allDay: "boolean",
  "kind?": type.enumerated(...eventKinds),
  "applicationId?": arkId("applications"),
  "replaces?": "string",
  "hidden?": "boolean",
  // The rest of what kloq's event panel edits, kept as kloq has it.
  "location?": "string <= 200",
  "description?": "string <= 2000",
  "meetingUrl?": "string <= 500",
  "color?": "'blue' | 'violet' | 'emerald' | 'amber' | 'rose'",
  "busy?": "boolean",
  // The zone it was set in, as an invite gives it ("America/New_York").
  "timeZone?": "string",
  "rrule?": "string <= 300",
  "exdates?": "string[]",
  "reminders?": type({ minutesBefore: "number", "method?": "'popup' | 'email'" })
    .array()
    .atMostLength(10),
  "attendees?": type({
    email: "string",
    "name?": "string",
    "status?": "'accepted' | 'declined' | 'tentative' | 'pending'",
    "optional?": "boolean",
  })
    .array()
    .atMostLength(50),
})

// What Save sends: the fields, with times the calendar can read, in order.
export const SaveEvent = EventFields.narrow((event, ctx) => {
  const shape = event.allDay ? dateOnly : instant
  if (!shape.test(event.start) || !shape.test(event.end))
    return ctx.reject({ message: "That event's time isn't one the calendar can read." })
  return (
    Date.parse(event.end) >= Date.parse(event.start) ||
    ctx.reject({ message: "An event can't end before it starts." })
  )
})

export const CalendarEvent = EventFields.omit("kind").and({
  userId: arkId("users"),
  kind: type.enumerated(...eventKinds),
  // Set by the server when a guest books it on one of your booking pages.
  "bookingPageId?": arkId("bookingPages"),
})

// How someone reads their calendar. Unset fields follow the browser and kloq's defaults.
export const CalendarSettings = type({
  "timeZone?": "string",
  "hour12?": "boolean",
  "weekStartsOn?": "0 | 1 | 6",
  "dayStartHour?": "number",
  "dayEndHour?": "number",
  // Other zones to show beside the hours, like a company's.
  "extraTimeZones?": "string[]",
})

const settingsProblem = (settings: typeof CalendarSettings.infer) => {
  if ((settings.extraTimeZones?.length ?? 0) > 3) return "Show up to 3 other time zones."
  for (const zone of [settings.timeZone, ...(settings.extraTimeZones ?? [])])
    if (zone !== undefined && !isTimeZone(zone)) return `${zone} isn't a time zone.`
  const start = settings.dayStartHour ?? 0
  const end = settings.dayEndHour ?? 24
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end > 24 || start >= end)
    return "The day has to start before it ends, between 0 and 24."
}

export const SaveSettings = CalendarSettings.narrow((settings, ctx) => {
  const problem = settingsProblem(settings)
  return !problem || ctx.reject({ message: problem })
})

export const CalendarSettingsRow = CalendarSettings.and({ userId: arkId("users") })
