import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

import { type ApplicationCard, priorityLabels, type Status, statusLabels, today } from "./data"
import { PriorityIcon, StatusIcon } from "./icons"
import { useSource } from "./source"

// The few things worth seeing first about an application, as small pills: where it
// stands, how well it fits, and whether anything is happening.

export const Pill = ({
  children,
  className,
  title,
}: {
  children: React.ReactNode
  className?: string
  title?: string
}) => (
  <Badge
    variant="outline"
    title={title}
    className={cn(
      "text-muted-foreground h-5 gap-1 rounded-full px-1.5 text-[11px] font-normal sm:h-5 sm:text-[11px]",
      className
    )}
  >
    {children}
  </Badge>
)

export const StatusBadge = ({ status }: { status: Status }) => (
  <Pill className="text-foreground">
    <StatusIcon status={status} className="size-3" />
    {statusLabels[status]}
  </Pill>
)

const fitTone = (fit: number) =>
  fit >= 75
    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
    : fit >= 50
      ? "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400"
      : ""

/** How well Jev thought the role fits, when a loop found it or its link was checked. */
export const FitBadge = ({ fit, isFit }: { fit: number; isFit?: boolean }) => (
  // A role Jev called not a fit stays neutral, whatever its score.
  <Pill
    className={isFit === false ? undefined : fitTone(fit)}
    title={isFit ? "Jev says it fits you" : "Jev's fit score"}
  >
    <svg viewBox="0 0 16 16" className="size-3" aria-hidden>
      <circle
        cx="8"
        cy="8"
        r="6"
        fill="none"
        stroke="currentColor"
        strokeOpacity=".3"
        strokeWidth="2"
      />
      <circle
        cx="8"
        cy="8"
        r="6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeDasharray={`${(Math.max(0, Math.min(100, fit)) / 100) * 37.7} 37.7`}
        transform="rotate(-90 8 8)"
      />
    </svg>
    {Math.round(fit)}% fit
  </Pill>
)

const open: Status[] = ["applied", "interviewing", "offer"]
const day = 24 * 60 * 60 * 1000

/** When anything last happened: a status change, a note, or mail from the company. */
export const lastActivity = (a: ApplicationCard) =>
  Math.max(
    ...a.history.map((e) => Date.parse(e.at)),
    a.lastNoteAt ? Date.parse(a.lastNoteAt) : 0,
    a.mail?.at ?? 0,
    Date.parse(a.createdAt)
  )

/** For an application still in play: Active with news in the last two weeks, or Quiet
 * with how long it's been. Closed and saved ones show nothing. */
export const activityOf = (a: ApplicationCard, now: number) => {
  if (!open.includes(a.status)) return undefined
  const days = Math.floor((now - lastActivity(a)) / day)
  if (days < 14) return { quiet: false, label: "Active" } as const
  const weeks = Math.floor(days / 7)
  return { quiet: true, label: `Quiet ${weeks}w` } as const
}

export const ActivityBadge = ({ a }: { a: ApplicationCard }) => {
  const source = useSource()
  // The sample data is pinned to its own today, so it doesn't drift to Quiet.
  const now = source.real ? Date.now() : Date.parse(today)
  const activity = activityOf(a, now)
  if (!activity) return null
  return (
    <Pill
      title={activity.quiet ? "No news for a while" : "Something happened in the last two weeks"}
    >
      <span
        className={cn(
          "size-1.5 rounded-full",
          activity.quiet ? "bg-muted-foreground/50" : "bg-emerald-500"
        )}
      />
      {activity.label}
    </Pill>
  )
}

export const PriorityBadge = ({ a }: { a: ApplicationCard }) =>
  a.priority === "none" ? null : (
    <Pill>
      <PriorityIcon priority={a.priority} />
      {priorityLabels[a.priority]}
    </Pill>
  )

/** The top badges, in order: status, fit, activity. */
export const TopBadges = ({ a }: { a: ApplicationCard }) => (
  <>
    <StatusBadge status={a.status} />
    {a.fit !== undefined && <FitBadge fit={a.fit} isFit={a.isFit} />}
    <ActivityBadge a={a} />
  </>
)
