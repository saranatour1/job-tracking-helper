import {
  Activity01Icon,
  Briefcase01Icon,
  Calendar03Icon,
  FileEditIcon,
  JobSearchIcon,
  Mail01Icon,
  RepeatIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react"

import { FitBadge, Pill } from "@/features/tracker/badges"
import { statusLabels } from "@/features/tracker/data"
import { StatusIcon } from "@/features/tracker/icons"
import { cn } from "@/lib/utils"

import { boardAt, type DemoCard, demoColumns, useDemoTick } from "./demo-board"

const nav: ({ label: string } | { title: string; icon: IconSvgElement; active?: boolean })[] = [
  { title: "Applications", icon: Briefcase01Icon, active: true },
  { title: "Email", icon: Mail01Icon },
  { title: "Calendar", icon: Calendar03Icon },
  { label: "Find roles" },
  { title: "Jobs", icon: JobSearchIcon },
  { title: "Loops", icon: RepeatIcon },
  { label: "Done for you" },
  { title: "Prefilled", icon: FileEditIcon },
  { title: "Activity", icon: Activity01Icon },
]

const Sidebar = () => (
  <div className="bg-sidebar hidden w-47 shrink-0 flex-col gap-0.5 border-e px-2 py-3 lg:flex">
    {nav.map((item) =>
      "label" in item ? (
        <span key={item.label} className="text-muted-foreground px-2 pt-3 pb-1 text-[11px]">
          {item.label}
        </span>
      ) : (
        <span
          key={item.title}
          className={cn(
            "text-muted-foreground flex h-7 items-center gap-2 rounded-md px-2 text-[13px]",
            item.active && "bg-sidebar-accent text-foreground font-medium"
          )}
        >
          <HugeiconsIcon icon={item.icon} className="size-3.5" />
          {item.title}
        </span>
      )
    )}
  </div>
)

// Cards share one layer instead of living inside their columns, so they can slide between them.
// A column is the card's width plus 12px of column padding and an 8px gap, hence the 20px. Each
// row is the card's 86px plus a 6px gap.
const Card = ({ card }: { card: DemoCard }) => (
  <div
    style={{ translate: `calc(${card.column} * (100% + 20px)) ${card.row * 92}px` }}
    className={cn(
      "bg-card animate-in fade-in absolute top-10 left-1.5 flex h-[86px] w-[calc(100%-12px)] flex-col gap-1.5 overflow-hidden rounded-lg border px-3 py-2.5 text-[13px] shadow-xs/5 transition-[translate,rotate,opacity,box-shadow] duration-700 ease-out motion-reduce:animate-none motion-reduce:transition-none md:w-[calc((100%-24px)/4-12px)]",
      card.ready && "border-primary",
      card.moving && "z-10 rotate-[1.5deg] shadow-lg",
      card.leaving && "opacity-0"
    )}
  >
    <span className="flex items-center gap-1.5 text-xs">
      <span className="bg-muted text-foreground/80 flex size-4 shrink-0 items-center justify-center rounded text-[10px] font-semibold uppercase">
        {card.company[0]}
      </span>
      <span className="text-foreground/80 truncate font-medium">{card.company}</span>
    </span>
    <span className="truncate leading-snug font-medium">{card.role}</span>
    <span className="flex gap-1">
      {card.ready && (
        <Pill className="border-primary bg-primary text-primary-foreground dark:bg-primary">
          Ready to submit
        </Pill>
      )}
      {card.note ? (
        <Pill>{card.note}</Pill>
      ) : (
        // Two pills don't fit side by side until the columns get wide enough.
        <span className={cn(card.ready && "md:max-xl:hidden")}>
          <FitBadge fit={card.fit} />
        </span>
      )}
    </span>
  </div>
)

export const Demo = () => {
  const { cards, counts, newest } = boardAt(useDemoTick())
  return (
    <div
      role="img"
      aria-label="A demo of the Applications board, with made-up applications moving from Saved to Applied, Interviewing and Offer."
      className="bg-background flex min-h-0 flex-1 overflow-hidden rounded-xl border"
    >
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-11 shrink-0 items-center gap-3 border-b px-3.5 text-[13px] font-medium">
          Applications
          <span className="text-muted-foreground ms-auto hidden min-w-0 items-center gap-2 truncate text-xs font-normal lg:flex">
            <span className="bg-success size-1.5 shrink-0 rounded-full" />
            Loop found {newest.role} at {newest.company}, {newest.fit}% fit
          </span>
          <Pill className="max-lg:ms-auto">Demo</Pill>
        </div>
        <div className="min-h-0 flex-1 p-2">
          <div className="relative flex h-full gap-2 overflow-hidden rounded-lg">
            {demoColumns.map((status, i) => (
              <div
                key={status}
                className={cn("bg-muted/40 flex-1 rounded-lg p-1.5", i > 0 && "max-md:hidden")}
              >
                <div className="flex h-7 items-center gap-1.5 px-1 text-[13px]">
                  <StatusIcon status={status} />
                  <span className="font-medium">{statusLabels[status]}</span>
                  <span className="text-muted-foreground tabular-nums">{counts[i]}</span>
                </div>
              </div>
            ))}
            {cards.map((card) => (
              <Card key={card.id} card={card} />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
