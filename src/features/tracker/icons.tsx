import { cn } from "@/lib/utils"

import { type Priority, type Status, priorityLabels, statusLabels } from "./data"

const statusColor: Record<Status, string> = {
  saved: "text-muted-foreground",
  applied: "text-muted-foreground",
  interviewing: "text-amber-500",
  offer: "text-emerald-500",
  rejected: "text-red-500",
  withdrawn: "text-muted-foreground",
}

// Small circle icons in the style of an issue tracker's workflow states.
export const StatusIcon = ({ status, className }: { status: Status; className?: string }) => (
  <svg
    viewBox="0 0 16 16"
    className={cn("size-3.5 shrink-0", statusColor[status], className)}
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    role="img"
    aria-label={statusLabels[status]}
  >
    {status === "saved" && <circle cx="8" cy="8" r="6.25" strokeDasharray="2 2" />}
    {status === "applied" && <circle cx="8" cy="8" r="6.25" />}
    {status === "interviewing" && (
      <>
        <circle cx="8" cy="8" r="6.25" />
        <path d="M8 3.5a4.5 4.5 0 0 1 0 9z" fill="currentColor" stroke="none" />
      </>
    )}
    {status === "offer" && (
      <>
        <circle cx="8" cy="8" r="7" fill="currentColor" stroke="none" />
        <path d="m5 8.2 2 2 4-4.2" stroke="var(--background)" />
      </>
    )}
    {status === "rejected" && (
      <>
        <circle cx="8" cy="8" r="7" fill="currentColor" stroke="none" />
        <path d="m5.75 5.75 4.5 4.5m0-4.5-4.5 4.5" stroke="var(--background)" />
      </>
    )}
    {status === "withdrawn" && (
      <>
        <circle cx="8" cy="8" r="7" fill="currentColor" stroke="none" />
        <path d="M5.5 8h5" stroke="var(--background)" />
      </>
    )}
  </svg>
)

const bars: Record<Priority, number> = { urgent: 0, high: 3, medium: 2, low: 1, none: 0 }

export const PriorityIcon = ({
  priority,
  className,
}: {
  priority: Priority
  className?: string
}) =>
  priority === "urgent" ? (
    <svg
      viewBox="0 0 16 16"
      className={cn("size-3.5 shrink-0 text-orange-500", className)}
      role="img"
      aria-label={priorityLabels[priority]}
    >
      <rect x="1" y="1" width="14" height="14" rx="3" fill="currentColor" />
      <path d="M8 4v5m0 2.5v.5" stroke="var(--background)" strokeWidth="2" strokeLinecap="round" />
    </svg>
  ) : (
    <svg
      viewBox="0 0 16 16"
      className={cn("text-muted-foreground size-3.5 shrink-0", className)}
      role="img"
      aria-label={priorityLabels[priority]}
    >
      {[0, 1, 2].map((i) =>
        priority === "none" ? (
          <rect
            key={i}
            x={2 + i * 4.5}
            y="7.25"
            width="3"
            height="1.5"
            rx=".5"
            fill="currentColor"
          />
        ) : (
          <rect
            key={i}
            x={2 + i * 4.5}
            y={10 - i * 3.5}
            width="3"
            height={4 + i * 3.5}
            rx=".75"
            fill="currentColor"
            opacity={i < bars[priority] ? 1 : 0.3}
          />
        )
      )}
    </svg>
  )
