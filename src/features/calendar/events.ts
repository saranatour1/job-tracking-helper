import { type Application, statusLabels } from "@/features/tracker/data"
import type { MailEvent } from "@/features/tracker/mail"

export type EventKind = "applied" | "moved" | "email" | "interview" | "followup"

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

// Everything worth a date: each application's applied day and later moves, every email,
// interview slots the emails proposed, and a follow-up a week after an application last
// heard anything while it's still at Applied.
export const eventsOf = (applications: Application[], mail: MailEvent[]): CalendarEvent[] => {
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
      const last = Math.max(
        ...a.history.map((h) => Date.parse(h.at)),
        ...mail.filter((m) => m.applicationId === a.id).map((m) => m.at)
      )
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
        ...(a && { applicationId: a.id }),
      })
  }
  return events.sort((x, y) => x.at - y.at)
}
