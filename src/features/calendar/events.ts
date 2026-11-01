import type { Doc, Id } from "@convex/_generated/dataModel"

import type { CalEvent, EventColor } from "@/components/kloq/lib/event-types"
import { formatInstant, instantPlus, parseInstant } from "@/components/kloq/lib/instant"
import { getRecurrenceEngine } from "@/components/kloq/lib/recurrence"
import { type ApplicationCard, statusLabels } from "@/features/tracker/data"
import type { MailEvent } from "@/features/tracker/mail"
import type { EventKind } from "./search"

export type { EventKind }

/** An event you added or fixed, as Convex keeps it. */
export type SavedEvent = Doc<"calendarEvents">

export type CalendarEvent = {
  id: string
  at: number
  kind: EventKind
  title: string
  detail: string
  applicationId?: string
  // An interview slot is a wall-clock time as the email wrote it (see slotOf), so it's
  // read with UTC getters; everything else is a moment, read in local time.
  wallClock?: boolean
  /** The zone the email gave with a wall-clock time, when it gave one. */
  zone?: string
  /** Yours to move: an interview slot or a follow-up, or anything you added. */
  editable?: boolean
  /** The row behind an event you added or fixed. */
  saved?: SavedEvent
}

const day = 86_400_000
/** How long without news before an application gets a follow-up. */
export const followUpAfter = 7 * day

const pad = (n: number) => String(n).padStart(2, "0")

/** The calendar day an event falls on, as YYYY-MM-DD. */
export const dayKey = (e: Pick<CalendarEvent, "at" | "wallClock">) => {
  const d = new Date(e.at)
  return e.wallClock
    ? `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
    : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** "10:30", or undefined for a day with no time (midnight wall-clock slots). */
export const timeOf = (e: CalendarEvent) => {
  const d = new Date(e.at)
  const [h, m] = e.wallClock ? [d.getUTCHours(), d.getUTCMinutes()] : [d.getHours(), d.getMinutes()]
  return e.wallClock && h === 0 && m === 0 ? undefined : `${pad(h)}:${pad(m)}`
}

// Everything worth a date: each application's applied day and later moves, the email given,
// interview slots those emails proposed, and a follow-up a week after an application last
// heard anything while it's still at Applied.
export const eventsOf = (applications: ApplicationCard[], mail: MailEvent[]): CalendarEvent[] => {
  const byId = new Map(applications.map((a) => [a.id, a]))
  const events: CalendarEvent[] = []
  for (const a of applications) {
    a.history.forEach((h, i) => {
      if (h.status === "saved") return
      events.push({
        id: `${a.id}:h${i}`,
        at: Date.parse(h.at),
        kind: h.status === "applied" ? "applied" : "moved",
        title:
          h.status === "applied" ? `Applied: ${a.role}` : `${statusLabels[h.status]}: ${a.role}`,
        detail: h.note ? `${a.company} · ${h.note}` : a.company,
        applicationId: a.id,
      })
    })
    if (a.status === "applied") {
      const last = Math.max(...a.history.map((h) => Date.parse(h.at)), a.mail?.at ?? 0)
      events.push({
        id: `${a.id}:follow-up`,
        at: last + followUpAfter,
        kind: "followup",
        title: `Follow up: ${a.role}`,
        detail: `No news from ${a.company} in a week`,
        applicationId: a.id,
      })
    }
  }
  for (const m of mail) {
    const a = m.applicationId ? byId.get(m.applicationId) : undefined
    events.push({
      id: m.id,
      at: m.at,
      kind: "email",
      title: m.subject,
      detail: a ? `${m.from} · ${a.company}` : m.from,
      ...(a && { applicationId: a.id }),
    })
    if (m.slot)
      events.push({
        id: `${m.id}:slot`,
        at: m.slot,
        kind: "interview",
        title: `Interview${a ? `: ${a.role}` : ""}`,
        detail: a?.company ?? m.from,
        wallClock: true,
        ...(m.slotZone && { zone: m.slotZone }),
        ...(a && { applicationId: a.id }),
      })
  }
  return events.sort((x, y) => x.at - y.at)
}

/** The days to read for the calendar on `date`: its month and the months either side, so
 * moving around a month reads nothing new and what a grid or list shows past its edges is
 * there. The year view reads its year. */
export const rangeOf = (date: string, view?: unknown) => {
  const [year = 0, month = 1] = date.split("-").map(Number)
  const first = (m: number) => new Date(Date.UTC(year, m, 1)).toISOString().slice(0, 10)
  return view === "year"
    ? { from: first(-1), to: first(13) }
    : { from: first(month - 2), to: first(month + 2) }
}

/** How each kind looks in kloq, and how long a timed one lasts (0: always all-day). */
export const kinds: Record<EventKind, { label: string; color?: EventColor; minutes: number }> = {
  applied: { label: "Applied", color: "blue", minutes: 30 },
  moved: { label: "Status change", color: "rose", minutes: 30 },
  email: { label: "Email", color: "violet", minutes: 15 },
  interview: { label: "Interview", color: "emerald", minutes: 60 },
  followup: { label: "Follow-up", color: "amber", minutes: 0 },
  // Yours keep whatever colour you pick in the event panel.
  reminder: { label: "Your events", minutes: 30 },
}

/** The calendar, and timeline row, for events not about any application. */
export const noApplication = "none"

/** The day a moment falls on in `zone` (or the browser's), as YYYY-MM-DD. */
export const dayIn = (at: number, zone?: string) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at)

/**
 * The events to show: the worked-out ones, minus any you fixed or removed, plus yours.
 * Interview slots and follow-ups become movable; moving one saves a fix in its place.
 */
export const withSaved = (
  derived: CalendarEvent[],
  saved: SavedEvent[],
  companyOf: (applicationId: string) => string | undefined
): CalendarEvent[] => {
  const replaced = new Set(saved.flatMap((s) => (s.replaces ? [s.replaces] : [])))
  const kept = derived
    .filter((e) => !replaced.has(e.id))
    .map((e) => (e.kind === "interview" || e.kind === "followup" ? { ...e, editable: true } : e))
  const yours = saved
    .filter((s) => !s.hidden)
    .map((s): CalendarEvent => ({
      id: s.key,
      at: parseInstant(s.start),
      kind: s.kind,
      title: s.title,
      detail: (s.applicationId && companyOf(s.applicationId)) || s.location || "",
      ...(s.applicationId && { applicationId: s.applicationId }),
      editable: true,
      saved: s,
    }))
  return [...kept, ...yours].sort((x, y) => x.at - y.at)
}

/**
 * One event as kloq draws it, in `zone` when you set one. Wall-clock slots are placed
 * in the zone their email named, else in yours. The application is its calendar, so
 * kloq's panel names it.
 */
export const toKloq = (e: CalendarEvent, zone?: string): CalEvent => {
  const kind = kinds[e.kind]
  if (e.saved) {
    const { key, title, start, end, allDay, color, ...rest } = e.saved
    const fields = {
      id: key,
      title,
      color: color ?? kind.color,
      location: rest.location,
      description: rest.description,
      meetingUrl: rest.meetingUrl,
      busy: rest.busy,
      timeZone: rest.timeZone,
      rrule: rest.rrule,
      exdates: rest.exdates,
      reminders: rest.reminders,
      attendees: rest.attendees,
      calendarId: e.applicationId ?? noApplication,
    }
    return allDay ? { ...fields, allDay: true, start, end } : { ...fields, start, end }
  }
  const base = {
    id: e.id,
    title: e.title,
    description: e.detail,
    color: kind.color,
    readOnly: !e.editable,
    calendarId: e.applicationId ?? noApplication,
  }
  const time = timeOf(e)
  if (!time || !kind.minutes) {
    const day = e.wallClock ? dayKey(e) : dayIn(e.at, zone)
    const next = new Date(`${day}T12:00Z`)
    next.setUTCDate(next.getUTCDate() + 1)
    return { ...base, allDay: true, start: day, end: next.toISOString().slice(0, 10) }
  }
  if (!e.wallClock) {
    const start = formatInstant(new Date(e.at))
    return { ...base, start, end: instantPlus(start, kind.minutes) }
  }
  // A Date whose local getters read the slot as written, placed in its zone.
  const d = new Date(e.at)
  const wall = new Date(
    d.getUTCFullYear(),
    d.getUTCMonth(),
    d.getUTCDate(),
    d.getUTCHours(),
    d.getUTCMinutes()
  )
  const slotZone = e.zone ?? zone
  const start = formatInstant(wall, slotZone)
  return {
    ...base,
    start,
    end: instantPlus(start, kind.minutes, slotZone),
    ...(e.zone && { timeZone: e.zone }),
  }
}

/** What to save when you add or change an event in kloq. */
export const toSaved = (
  ev: CalEvent,
  e: CalendarEvent | undefined,
  applicationIds: Set<string>
) => ({
  key: ev.id,
  title: ev.title,
  start: ev.start,
  end: ev.end,
  allDay: ev.allDay === true,
  // A fix keeps the kind it had; for your own, the server reads it from the title.
  kind: e?.saved
    ? e.saved.replaces
      ? e.saved.kind
      : undefined
    : e?.kind === "interview" || e?.kind === "followup"
      ? e.kind
      : undefined,
  applicationId:
    ev.calendarId && applicationIds.has(ev.calendarId)
      ? (ev.calendarId as Id<"applications">)
      : undefined,
  // A fix keeps naming what it replaces; a worked-out event becomes a fix of itself.
  replaces: e?.saved ? e.saved.replaces : e?.id,
  location: ev.location,
  description: ev.description,
  meetingUrl: ev.meetingUrl,
  color: ev.color,
  busy: ev.busy,
  timeZone: ev.timeZone,
  rrule: ev.rrule,
  exdates: ev.exdates,
  reminders: ev.reminders,
  attendees: ev.attendees,
})

/** When an event happens as the list shows it, in `zone`: its day, and its time unless all-day. */
/** A repeating event's dates between two moments, through the engine the grid uses; any other event is just itself. */
export const datesOf = (ev: CalEvent, start: Date, end: Date): CalEvent[] =>
  ev.rrule
    ? getRecurrenceEngine()(ev, { start, end }).occurrences.map((o) => ({
        ...ev,
        start: o.start,
        end: o.end,
      }))
    : [ev]

export const whenOf = (ev: CalEvent, zone?: string, hour12?: boolean) => {
  if (ev.allDay) return { at: parseInstant(ev.start), day: ev.start }
  const at = parseInstant(ev.start)
  const time = new Intl.DateTimeFormat(undefined, {
    timeZone: zone,
    hour: "numeric",
    minute: "2-digit",
    hour12,
  }).format(at)
  return { at, day: dayIn(at, zone), time }
}
