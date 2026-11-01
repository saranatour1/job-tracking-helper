import { FireIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { Link } from "@tanstack/react-router"
import { useQuery } from "convex-helpers/react/cache/hooks"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsPanel, TabsTab } from "@/components/ui/tabs"
import { useCalendarSettings } from "@/features/calendar/saved"
import { api } from "@/lib/api"
import { cn } from "@/lib/utils"

import { useSource } from "./source"
import { activityOf, levelOf, streakLine, streakOf, streakTitle, weeksText } from "./streak"

// Undefined while loading and on the sample data. Weeks start where the calendar's do.
const useSends = () => {
  const { real } = useSource()
  const sends = useQuery(api.applications.sends, real ? {} : "skip")
  const weekStartsOn = useCalendarSettings()?.weekStartsOn ?? 1
  return sends && { sends, weekStartsOn, streak: streakOf(sends, Date.now(), weekStartsOn) }
}

/** In the header of the applications board, so it's there on the page people use most. */
export const StreakPill = () => {
  const data = useSends()
  if (!data?.streak.total) return null
  const { streak } = data
  const title = `${streakTitle(streak)}. ${streakLine(streak)}`
  return (
    <Button
      variant="ghost"
      size="sm"
      title={title}
      aria-label={title}
      render={<Link to="/goals" />}
    >
      <HugeiconsIcon
        icon={FireIcon}
        className={streak.thisWeek ? "text-primary" : "text-muted-foreground"}
      />
      <span className="tabular-nums">
        {streak.current ? `${streak.current}w` : `${streak.total} sent`}
      </span>
    </Button>
  )
}

const ranges = [
  { label: "6 months", weeks: 26 },
  { label: "9 months", weeks: 39 },
  { label: "Year", weeks: 53 },
]

// The primary color's hue, but brighter the busier in dark mode: at low opacity on a dark card,
// primary itself hides a single application.
const levels = [
  "bg-foreground/10",
  "bg-indigo-200 dark:bg-indigo-800",
  "bg-indigo-400 dark:bg-indigo-600",
  "bg-indigo-600 dark:bg-indigo-400",
  "bg-indigo-800 dark:bg-indigo-200",
]

// Days are local, so this can't use formatDate, which reads them in UTC.
const dayLabel = (day: number) =>
  new Date(day).toLocaleDateString("en-US", { month: "short", day: "numeric" })

// One square a day, a column a week. On a phone the year scrolls sideways, and row-reverse
// opens it at the newest week.
const ActivityGrid = ({
  sends,
  weeks,
  label,
  weekStartsOn,
}: {
  sends: number[]
  weeks: number
  label: string
  weekStartsOn: number
}) => {
  const days = activityOf(sends, Date.now(), weeks, weekStartsOn)
  const sent = days.reduce((sum, d) => sum + d.sent, 0)
  return (
    <div className="flex flex-row-reverse overflow-x-auto [scrollbar-width:none]">
      <div
        role="img"
        aria-label={`${sent} sent in the last ${label.toLowerCase()}`}
        className="grid w-full min-w-max auto-cols-[minmax(0.5rem,1fr)] grid-flow-col grid-rows-[repeat(7,auto)] gap-0.5 sm:gap-1"
      >
        {days.map(({ day, sent, future }) => (
          <div
            key={day}
            title={future ? undefined : `${dayLabel(day)}: ${sent} sent`}
            className={cn(
              "aspect-square rounded-[3px]",
              future ? "invisible" : levels[levelOf(sent)]
            )}
          />
        ))}
      </div>
    </div>
  )
}

/** The whole picture, at the top of Goals. */
export const StreakCard = () => {
  const data = useSends()
  if (!data) return null
  const { sends, weekStartsOn, streak } = data
  const tiles = [
    ...(streak.current ? [{ value: weeksText(streak.current), label: "Current streak" }] : []),
    { value: weeksText(streak.best), label: "Top streak" },
    { value: String(streak.busiestWeek), label: "Busiest week" },
    { value: weeksText(streak.activeWeeks), label: "Weeks active" },
  ]
  return (
    <section aria-label="Your streak" className="bg-muted/60 flex flex-col gap-4 rounded-2xl p-2">
      <div className="flex flex-col gap-1 px-2 pt-2">
        <h3 className="text-muted-foreground text-sm">Applications sent</h3>
        {streak.total > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-3xl font-medium">{streak.total}</span>
            {streak.thisWeek > 0 && (
              <Badge variant="success" className="tabular-nums">
                +{streak.thisWeek} this week
              </Badge>
            )}
          </div>
        )}
        <p className="text-sm">{streakLine(streak)}</p>
      </div>
      {streak.total > 0 && (
        <dl className="grid grid-cols-2 gap-2 sm:auto-cols-fr sm:grid-flow-col sm:grid-cols-none">
          {tiles.map(({ value, label }) => (
            <div
              key={label}
              className="bg-card flex flex-col-reverse gap-0.5 rounded-xl border px-3 py-2 shadow-xs"
            >
              <dt className="text-muted-foreground text-xs">{label}</dt>
              <dd className="text-sm font-medium tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
      )}
      <Tabs defaultValue={ranges[0]!.weeks} className="gap-1 px-2 pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-muted-foreground text-sm">Activity</h4>
          <TabsList size="sm" variant="underline" aria-label="How far back">
            {ranges.map(({ label, weeks }) => (
              <TabsTab key={weeks} value={weeks}>
                {label}
              </TabsTab>
            ))}
          </TabsList>
        </div>
        {ranges.map(({ label, weeks }) => (
          <TabsPanel key={weeks} value={weeks}>
            <ActivityGrid sends={sends} weeks={weeks} label={label} weekStartsOn={weekStartsOn} />
          </TabsPanel>
        ))}
      </Tabs>
    </section>
  )
}
