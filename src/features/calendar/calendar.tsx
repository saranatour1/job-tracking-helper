import { Link, useNavigate, useSearch } from "@tanstack/react-router"

import { Button } from "@/components/ui/button"
import { Calendar as MonthGrid } from "@/components/ui/calendar"
import { ScrollArea } from "@/components/ui/scroll-area"
import { PageHeader } from "@/features/shell/page-header"
import { useSource } from "@/features/tracker/source"
import { cn } from "@/lib/utils"

import { type CalendarEvent, dayKey, type EventKind, eventsOf, timeOf } from "./events"

const kinds: Record<EventKind, { label: string; dot: string }> = {
  applied: { label: "Applied", dot: "bg-info" },
  moved: { label: "Status change", dot: "bg-muted-foreground" },
  email: { label: "Email", dot: "bg-foreground/40" },
  interview: { label: "Interview", dot: "bg-success" },
  followup: { label: "Follow-up", dot: "bg-warning" },
}

const pad = (n: number) => String(n).padStart(2, "0")
const keyOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const dateOf = (key: string) => {
  const [y, m, d] = key.split("-").map(Number)
  return new Date(y!, m! - 1, d)
}
const longDay = (key: string) =>
  dateOf(key).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })

// The selected day lives in the URL, so a reload or a shared link opens the same day.
export const calendarSearch = (search: Record<string, unknown>): { day?: string } => ({
  day:
    typeof search.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(search.day)
      ? search.day
      : undefined,
})

const EventRow = ({ e }: { e: CalendarEvent }) => {
  const body = (
    <>
      <span className="text-muted-foreground w-11 shrink-0 text-xs tabular-nums">
        {timeOf(e) ?? ""}
      </span>
      <span className={cn("size-2 shrink-0 rounded-full", kinds[e.kind].dot)} />
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-[13px] font-medium">{e.title}</span>
        <span className="text-muted-foreground truncate text-xs">{e.detail}</span>
      </span>
    </>
  )
  const row = "flex items-center gap-3 rounded-md px-2 py-1.5"
  return e.applicationId ? (
    <Link
      to="/pipeline/$id"
      params={{ id: e.applicationId }}
      className={cn(row, "hover:bg-accent/50 transition-colors duration-150")}
    >
      {body}
    </Link>
  ) : (
    <div className={row}>{body}</div>
  )
}

const DayList = ({
  day,
  events,
  empty,
}: {
  day: string
  events: CalendarEvent[]
  empty?: string
}) => (
  <section aria-label={longDay(day)} className="flex flex-col gap-1">
    <h3 className="text-muted-foreground px-2 text-xs font-medium">{longDay(day)}</h3>
    {events.length ? (
      events.map((e) => <EventRow key={e.id} e={e} />)
    ) : (
      <p className="text-muted-foreground px-2 py-1.5 text-[13px]">{empty}</p>
    )}
  </section>
)

// One place for every date the tracker knows: when you applied, each move and email,
// interview slots from invites, and when to follow up. A month grid marks the busy days;
// the agenda shows the chosen day, then the next two weeks.
export const CalendarPage = () => {
  const { applications, mail, loaded } = useSource()
  const search = useSearch({ from: "/_app/calendar" })
  const navigate = useNavigate({ from: "/calendar" })
  const today = keyOf(new Date())
  const day = search.day ?? today
  const pick = (key: string) => void navigate({ search: { day: key }, replace: true })

  const events = eventsOf(applications, mail)
  const byDay = new Map<string, CalendarEvent[]>()
  for (const e of events) byDay.set(dayKey(e), [...(byDay.get(dayKey(e)) ?? []), e])
  const ahead = [...byDay.keys()]
    .filter((key) => key > day && dateOf(key).getTime() - dateOf(day).getTime() <= 14 * 86_400_000)
    .sort()

  return (
    <div className="flex h-svh flex-col md:h-[calc(100svh-1rem)]">
      <PageHeader
        crumbs={[{ label: "Calendar" }]}
        actions={
          <Button variant="ghost" size="sm" disabled={day === today} onClick={() => pick(today)}>
            Today
          </Button>
        }
      />
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <aside className="flex shrink-0 flex-col gap-4 border-b p-4 md:border-e md:border-b-0">
          <MonthGrid
            mode="single"
            required
            selected={dateOf(day)}
            onSelect={(d) => d && pick(keyOf(d))}
            defaultMonth={dateOf(day)}
            modifiers={{ busy: [...byDay.keys()].map(dateOf) }}
            // A small dot under each day that has something on it.
            modifiersClassNames={{
              busy: "relative after:absolute after:bottom-1 after:left-1/2 after:size-1 after:-translate-x-1/2 after:rounded-full after:bg-primary",
            }}
          />
          <ul className="text-muted-foreground grid grid-cols-2 gap-x-4 gap-y-1 px-1 text-xs">
            {Object.values(kinds).map((k) => (
              <li key={k.label} className="flex items-center gap-1.5">
                <span className={cn("size-2 rounded-full", k.dot)} />
                {k.label}
              </li>
            ))}
          </ul>
        </aside>
        <ScrollArea className="min-h-0 flex-1">
          <div className="mx-auto flex max-w-2xl flex-col gap-6 p-4 md:p-6">
            {/* Nothing until the first load, so an empty day never flashes. */}
            {loaded && (
              <DayList day={day} events={byDay.get(day) ?? []} empty="Nothing on this day." />
            )}
            {ahead.length > 0 && (
              <div className="flex flex-col gap-4 border-t pt-6">
                <h2 className="px-2 text-[13px] font-medium">Next two weeks</h2>
                {ahead.map((key) => (
                  <DayList key={key} day={key} events={byDay.get(key)!} />
                ))}
              </div>
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  )
}
