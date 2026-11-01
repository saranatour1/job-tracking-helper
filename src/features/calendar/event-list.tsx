import { ArrowUpRight01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { Link } from "@tanstack/react-router"

import { applicationText } from "@/lib/route-ids"
import { EVENT_COLORS } from "@/components/kloq/lib/event-palette"
import type { CalEvent } from "@/components/kloq/lib/event-types"
import type { ApplicationCard } from "@/features/tracker/data"
import { cn } from "@/lib/utils"

import { type CalendarEvent, dayIn, kinds, whenOf } from "./events"

type Item = { e: CalendarEvent; ev: CalEvent; at: number; day: string; time?: string }

const longDay = (day: string) =>
  new Date(`${day}T12:00`).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  })

const Row = ({
  item,
  application,
  onPick,
  showDay,
}: {
  item: Item
  application?: ApplicationCard | undefined
  onPick: () => void
  showDay?: boolean
}) => {
  const color = item.ev.color ?? kinds[item.e.kind].color
  return (
    <li className="group flex items-center gap-1">
      <button
        type="button"
        onClick={onPick}
        className="hover:bg-accent/50 flex min-w-0 flex-1 items-center gap-2.5 rounded-md px-2 py-1.5 text-start transition-colors duration-150"
      >
        <span className="text-muted-foreground w-16 shrink-0 text-xs tabular-nums">
          {showDay ? longDay(item.day).replace(/^\w+, /, "") : (item.time ?? "All day")}
        </span>
        <span
          className={cn(
            "size-2 shrink-0 rounded-full",
            color ? EVENT_COLORS[color].bar : "bg-foreground/40"
          )}
        />
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-[13px] font-medium">{item.e.title}</span>
          {item.e.detail && (
            <span className="text-muted-foreground truncate text-xs">{item.e.detail}</span>
          )}
        </span>
      </button>
      {item.e.applicationId && (
        <Link
          to="/pipeline/$id"
          params={{ id: application ? applicationText(application) : item.e.applicationId }}
          aria-label="Open its application"
          className="text-muted-foreground hover:text-foreground rounded-md p-1 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
        >
          <HugeiconsIcon icon={ArrowUpRight01Icon} className="size-3.5" />
        </Link>
      )}
    </li>
  )
}

// What's coming up beside the grid: day by day from the chosen date, or each application's
// dates together. Clicking a row takes the grid to that day.
export const EventList = ({
  events,
  kloq,
  applications,
  from,
  zone,
  hour12,
  group,
  onPick,
}: {
  events: CalendarEvent[]
  kloq: Map<string, CalEvent>
  applications: ApplicationCard[]
  from: string
  zone?: string
  hour12?: boolean
  group: "day" | "application"
  onPick: (day: string) => void
}) => {
  const appsById = new Map(applications.map((a) => [a.id, a]))
  const items = events.flatMap((e): Item[] => {
    const ev = kloq.get(e.id)
    return ev ? [{ e, ev, ...whenOf(ev, zone, hour12) }] : []
  })

  if (group === "day") {
    const until = new Date(`${from}T12:00`)
    until.setDate(until.getDate() + 30)
    const ahead = items.filter((i) => i.day >= from && i.day <= dayIn(until.getTime()))
    const days = new Map<string, Item[]>()
    for (const i of ahead) days.set(i.day, [...(days.get(i.day) ?? []), i])
    if (!days.size)
      return (
        <p className="text-muted-foreground px-2 py-1.5 text-[13px]">
          Nothing in the next 30 days.
        </p>
      )
    return (
      <div className="flex flex-col gap-4">
        {[...days].map(([day, list]) => (
          <section key={day} aria-label={longDay(day)} className="flex flex-col gap-0.5">
            <h3 className="text-muted-foreground px-2 text-xs font-medium">{longDay(day)}</h3>
            <ul>
              {list.map((i) => (
                <Row
                  key={i.e.id}
                  item={i}
                  application={appsById.get(i.e.applicationId ?? "")}
                  onPick={() => onPick(i.day)}
                />
              ))}
            </ul>
          </section>
        ))}
      </div>
    )
  }

  // Each application with its next dates first, then its latest; most pressing on top.
  const byApp = new Map<string, Item[]>()
  for (const i of items) {
    const key = i.e.applicationId ?? ""
    byApp.set(key, [...(byApp.get(key) ?? []), i])
  }
  const now = Date.now()
  const groups = [...byApp].map(([id, list]) => {
    const next = list.filter((i) => i.at >= now)
    const past = list.filter((i) => i.at < now).slice(-3)
    return { id, list: [...past, ...next.slice(0, 5)], soonest: next[0]?.at ?? Infinity }
  })
  groups.sort((a, b) => a.soonest - b.soonest)
  return (
    <div className="flex flex-col gap-4">
      {groups.map(({ id, list }) => {
        const a = appsById.get(id)
        return (
          <section key={id || "none"} className="flex flex-col gap-0.5">
            <h3 className="flex items-baseline gap-1.5 px-2 text-xs font-medium">
              {a ? (
                <Link
                  to="/pipeline/$id"
                  params={{ id: applicationText(a) }}
                  className="truncate hover:underline"
                >
                  {a.company} · {a.role}
                </Link>
              ) : (
                <span className="text-muted-foreground">Not about an application</span>
              )}
              {a?.code && <span className="text-muted-foreground shrink-0">{a.code}</span>}
            </h3>
            <ul>
              {list.map((i) => (
                <Row key={i.e.id} item={i} application={a} showDay onPick={() => onPick(i.day)} />
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}
