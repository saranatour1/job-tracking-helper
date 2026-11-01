import type { KloqView } from "@/components/kloq"

import { type EventKind, kinds } from "./events"

const views = ["day", "week", "month", "agenda", "year", "timeline"] as const
export const kindKeys = Object.keys(kinds) as EventKind[]

export type CalendarSearch = {
  view?: KloqView
  date?: string
  hide?: EventKind[]
  list?: "application"
}

// The view, the date it's on, the kinds you hid and how the list groups all live in the
// URL, as kloq's own URL example has them (`?view=3&date=2026-10-29`). A number is an
// n-day view, 2 to 14 days.
export const calendarSearch = (search: Record<string, unknown>): CalendarSearch => ({
  view:
    views.find((v) => v === search.view) ??
    (Number.isInteger(search.view) && Number(search.view) >= 2 && Number(search.view) <= 14
      ? Number(search.view)
      : undefined),
  date:
    typeof search.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(search.date)
      ? search.date
      : undefined,
  hide: Array.isArray(search.hide)
    ? kindKeys.filter((k) => (search.hide as unknown[]).includes(k))
    : undefined,
  list: search.list === "application" ? "application" : undefined,
})
