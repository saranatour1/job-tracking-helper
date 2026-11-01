import { type } from "arktype"
import { arkId, cutTo } from "../../lib/ark"
import { isTimeZone } from "../loops/schedule"

export const eventKinds = ["interview", "followup", "reminder"] as const
export type EventKind = (typeof eventKinds)[number]

export const maxEvents = 500

const instant = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?(Z|[+-]\d{2}:\d{2}))?$/
const dateOnly = /^\d{4}-\d{2}-\d{2}$/

const cut = (max: number) => type("string").pipe(cutTo(max)).to("string")

const Reminder = type({ minutesBefore: "number", "method?": "'popup' | 'email'" })
const Attendee = type({
  email: "string",
  "name?": "string",
  "status?": "'accepted' | 'declined' | 'tentative' | 'pending'",
  "optional?": "boolean",
})

export const EventFields = type({
  key: "string <= 100",
  title: type("string.trim").pipe(cutTo(200)).to("string"),
  start: "string",
  end: "string",
  allDay: "boolean",
  "kind?": type.enumerated(...eventKinds),
  "applicationId?": arkId("applications"),
  "replaces?": "string",
  "hidden?": "boolean",
  "location?": cut(200),
  "description?": cut(2000),
  "meetingUrl?": cut(500),
  "color?": "'blue' | 'violet' | 'emerald' | 'amber' | 'rose'",
  "busy?": "boolean",
  "timeZone?": "string",
  "rrule?": cut(300),
  "exdates?": type("string[]")
    .pipe((dates) => dates.slice(-200))
    .to("string[]"),
  "reminders?": Reminder.array()
    .pipe((reminders) => reminders.slice(0, 10))
    .to(Reminder.array()),
  "attendees?": Attendee.array()
    .pipe((attendees) => attendees.slice(0, 50))
    .to(Attendee.array()),
})

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
})

export const CalendarSettings = type({
  "timeZone?": "string",
  "hour12?": "boolean",
  "weekStartsOn?": "0 | 1 | 6",
  "dayStartHour?": "number",
  "dayEndHour?": "number",
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
