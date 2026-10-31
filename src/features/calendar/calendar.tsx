import { Link, useNavigate, useSearch } from "@tanstack/react-router"
import { useQuery } from "convex-helpers/react/cache/hooks"
import { api } from "@/lib/api"
import { applicationText } from "@/lib/route-ids"
import { useCallback, useMemo, useRef } from "react"

import {
  byResourceId,
  type CalEvent,
  type CalendarSource,
  EVENT_COLORS,
  eventsToICS,
  expandRecurrence,
  formatInstant,
  Kloq,
  type KloqChange,
  KloqNav,
  KloqToolbar,
  type KloqView,
  type Lane,
  parseICS,
  parseInstant,
  rangeOfView,
  registerCalendarAccounts,
  registerCalendarSources,
  useKloq,
  useKloqStore,
} from "@/components/kloq"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { PageHeader } from "@/features/shell/page-header"
import type { ApplicationCard } from "@/features/tracker/data"
import { useSource } from "@/features/tracker/source"
import { cn } from "@/lib/utils"

import { EventList } from "./event-list"
import {
  type EventKind,
  eventsOf,
  kinds,
  noApplication,
  rangeOf,
  toKloq,
  toSaved,
  withSaved,
} from "./events"
import { useCalendarSettings, useLast, useRemoveEvent, useSaveEvent, useSavedEvents } from "./saved"

const views = ["day", "week", "month", "agenda", "year", "timeline"] as const
const kindKeys = Object.keys(kinds) as EventKind[]
const pad = (n: number) => String(n).padStart(2, "0")
const keyOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const dateOf = (key: string) => new Date(`${key}T00:00`)

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

// Applications are kloq "calendars", so its event panel names the one an event is about
// and lets you pick another for your own events. Registered for as long as the page is.
const account = "job-search"
const sourcesOf = (applications: ApplicationCard[]): CalendarSource[] => [
  { id: noApplication, name: "No application", color: "blue", accountId: account, isDefault: true },
  ...applications.map((a) => ({
    id: a.id,
    name: `${a.company} · ${a.role}`,
    color: "blue" as const,
    accountId: account,
  })),
]
const register = (json: string) => {
  const offAccount = registerCalendarAccounts({
    id: account,
    label: "Applications",
    provider: "job-tracking-helper",
    providerLabel: "Job search",
  })
  const offSources = registerCalendarSources(...(JSON.parse(json) as CalendarSource[]))
  return () => {
    offSources()
    offAccount()
  }
}

// One timeline row per application, so dragging an event to another row relinks it.
const byApplication = byResourceId("calendarId")

const download = (text: string, name: string) => {
  const url = URL.createObjectURL(new Blob([text], { type: "text/calendar;charset=utf-8" }))
  Object.assign(document.createElement("a"), { href: url, download: name }).click()
  URL.revokeObjectURL(url)
}

/** Import an invite's .ics as your events, or export what's on screen to another calendar. */
const IcsButtons = () => {
  const store = useKloqStore()
  const k = useKloq()
  const file = useRef<HTMLInputElement>(null)
  const importFile = async (picked: File | undefined) => {
    if (!picked) return
    // A UID becomes the key, so importing the same invite twice adds it once.
    const { events } = parseICS(await picked.text(), {
      uidToId: (uid) => `ics:${uid}`.slice(0, 100),
    })
    // kloq reads a TZID time as local wall-clock and keeps the zone aside; place it in
    // that zone instead, so a "10:00 New York" invite lands at 10:00 New York.
    const fresh = events
      .filter((e) => !store.get(e.id))
      .map((e) =>
        e.allDay || !e.timeZone
          ? e
          : {
              ...e,
              start: formatInstant(new Date(parseInstant(e.start)), e.timeZone),
              end: formatInstant(new Date(parseInstant(e.end)), e.timeZone),
            }
      )
    store.batch(fresh.map((event) => ({ type: "add" as const, event })))
    if (fresh[0]) k.goToDate(new Date(parseInstant(fresh[0].start)))
  }
  const exportVisible = () => {
    const range = rangeOfView(k.view)
    const visible = store
      .getSnapshot()
      .filter((e) => expandRecurrence(e, range).occurrences.length > 0)
    download(eventsToICS(visible, { prodId: "job-tracking-helper" }), "job-search.ics")
  }
  return (
    <div className="flex items-center gap-1">
      <Button variant="ghost" size="xs" onClick={() => file.current?.click()}>
        Import .ics
      </Button>
      <input
        ref={file}
        type="file"
        accept=".ics,text/calendar"
        aria-label="Calendar file"
        hidden
        onChange={(e) => void importFile(e.target.files?.[0])}
      />
      <Button variant="ghost" size="xs" onClick={exportVisible}>
        Export
      </Button>
    </div>
  )
}

// One place for every date the tracker knows, and the ones you add: when you applied,
// each move and email, interview slots from invites, follow-ups, and your own events.
// Click an event for its details; double-click opens its application.
export const CalendarPage = () => {
  const { applications } = useSource()
  const settings = useCalendarSettings() ?? {}
  const save = useSaveEvent()
  const remove = useRemoveEvent()
  const search = useSearch({ from: "/_app/calendar" })
  const navigate = useNavigate({ from: "/calendar" })
  const write = (patch: CalendarSearch) =>
    void navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true })

  const zone = settings.timeZone
  const today = keyOf(new Date())
  const date = search.date ?? today
  // The list by application takes each one's next and latest dates, wherever they are.
  const range = search.list === "application" ? undefined : rangeOf(date, search.view)
  const saved = useLast(useSavedEvents(range)) ?? []
  const mail =
    useLast(
      useQuery(
        api.email.timeline,
        range ? { from: Date.parse(range.from), to: Date.parse(range.to) } : {}
      )
    ) ?? []
  const appsById = new Map(applications.map((a) => [a.id, a]))
  const appIds = new Set(appsById.keys())
  const all = withSaved(eventsOf(applications, mail), saved, (id) => appsById.get(id)?.company)
  const byId = new Map(all.map((e) => [e.id, e]))
  const hidden = new Set(search.hide ?? [])
  const shown = all.filter((e) => !hidden.has(e.kind))
  const kloq = new Map(shown.map((e) => [e.id, toKloq(e, zone)]))
  const events = [...kloq.values()]

  // kloq reports each change once; Convex keeps it, and the optimistic update shows it now.
  const commit = async (change: KloqChange): Promise<void> => {
    switch (change.type) {
      case "batch":
        await Promise.all(change.changes.map(commit))
        return
      case "reset":
        return
      case "add":
        await save(toSaved(change.event, byId.get(change.event.id), appIds))
        return
      case "update":
        await save(
          toSaved({ ...change.prev, ...change.patch } as CalEvent, byId.get(change.id), appIds)
        )
        return
      case "remove": {
        const e = byId.get(change.event.id)
        if (e?.saved) await remove({ key: e.id })
        else await save({ ...toSaved(change.event, e, appIds), hidden: true })
      }
    }
  }

  const sourcesKey = JSON.stringify(sourcesOf(applications))
  const registerApplications = useCallback(
    (el: HTMLDivElement | null) => (el ? register(sourcesKey) : undefined),
    [sourcesKey]
  )
  // Nothing new before today; what's already there can still be moved out of the past.
  const constraints = useMemo(() => ({ minDate: dateOf(today) }), [today])
  const lanes: Lane[] = [
    ...applications
      .filter((a) => shown.some((e) => e.applicationId === a.id))
      .map((a) => ({ id: a.id, label: a.company, sublabel: a.code ?? a.role })),
    { id: noApplication, label: "Not about an application" },
  ]

  const shared = {
    date: dateOf(date),
    onDateChange: (d: Date) => write({ date: keyOf(d) }),
    events,
    onEventsChange: () => {},
    onCommit: commit,
    onEventDoubleClick: (e: CalEvent) => {
      const id = byId.get(e.id)?.applicationId
      const a = id && appsById.get(id)
      if (a) void navigate({ to: "/pipeline/$id", params: { id: applicationText(a) } })
    },
    theme: "coss",
    designMode: false,
    workingHours: false,
    constraints,
    displayTimeZone: zone,
    hour12: settings.hour12,
    weekStartsOn: settings.weekStartsOn ?? 1,
  } as const

  return (
    <div ref={registerApplications} className="flex h-svh flex-col md:h-[calc(100svh-1rem)]">
      <PageHeader crumbs={[{ label: "Calendar" }]} />
      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1">
          <Kloq
            {...shared}
            view={search.view ?? "month"}
            onViewChange={(view) => write({ view })}
            // kloq would narrow a week to 3 days here and report it as a view change,
            // which would overwrite the view you picked in the URL.
            responsive={false}
            lanes={lanes}
            laneAdapter={byApplication}
            timeZones={settings.extraTimeZones}
            dayStartHour={settings.dayStartHour}
            dayEndHour={settings.dayEndHour}
          >
            <KloqToolbar>
              <KloqNav />
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="xs" render={<Link to="/account" hash="booking" />}>
                  Booking pages
                </Button>
                <IcsButtons />
              </div>
            </KloqToolbar>
          </Kloq>
        </div>
        <aside className="hidden w-80 shrink-0 flex-col border-s lg:flex">
          {/* The month beside the grid: pick a day and the grid and list go there. */}
          <div className="h-72 shrink-0 border-b">
            <Kloq {...shared} view="month" responsive={false} commandPalette={false} />
          </div>
          <div className="flex flex-col gap-2 border-b p-3">
            <ToggleGroup
              multiple
              size="sm"
              variant="outline"
              aria-label="Kinds to show"
              className="flex-wrap"
              value={kindKeys.filter((k) => !hidden.has(k))}
              onValueChange={(on) => {
                const hide = kindKeys.filter((k) => !(on as string[]).includes(k))
                write({ hide: hide.length ? hide : undefined })
              }}
            >
              {kindKeys.map((k) => {
                const color = kinds[k].color
                return (
                  <ToggleGroupItem key={k} value={k} className="gap-1.5 text-xs">
                    <span
                      className={cn(
                        "size-2 rounded-full",
                        color ? EVENT_COLORS[color].bar : "bg-foreground/40"
                      )}
                    />
                    {kinds[k].label}
                  </ToggleGroupItem>
                )
              })}
            </ToggleGroup>
            <ToggleGroup
              size="sm"
              variant="outline"
              aria-label="Group the list"
              className="*:flex-1"
              value={[search.list ?? "day"]}
              onValueChange={(v) =>
                v[0] && write({ list: v[0] === "application" ? "application" : undefined })
              }
            >
              <ToggleGroupItem value="day">By day</ToggleGroupItem>
              <ToggleGroupItem value="application">By application</ToggleGroupItem>
            </ToggleGroup>
          </div>
          <ScrollArea className="min-h-0 flex-1">
            <div className="p-2">
              <EventList
                events={shown}
                kloq={kloq}
                applications={applications}
                from={date}
                zone={zone}
                hour12={settings.hour12}
                group={search.list ?? "day"}
                onPick={(day) => write({ date: day })}
              />
            </div>
          </ScrollArea>
        </aside>
      </div>
    </div>
  )
}
