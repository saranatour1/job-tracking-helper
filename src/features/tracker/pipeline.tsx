import {
  FilterIcon,
  Layers01Icon,
  MoreHorizontalIcon,
  PlusSignIcon,
  SidebarRight01Icon,
  SlidersHorizontalIcon,
  Target02Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { Link } from "@tanstack/react-router"
import { useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Tooltip, TooltipPopup, TooltipTrigger } from "@/components/ui/tooltip"
import { useIsMobile } from "@/hooks/use-media-query"

import {
  type Application,
  type FilterField,
  type Filters,
  type Status,
  formatDate,
  goalName,
  goals,
  matches,
  priorities,
  priorityLabels,
  statusLabels,
  statuses,
  views,
  useApplications,
} from "./data"
import { type Display, DisplayOptions, defaultDisplay } from "./display-options"
import { FilterChips, FilterMenu, toggleFilter } from "./filters"
import { ApplicationPeek } from "./application"
import { PriorityIcon, StatusIcon } from "./icons"
import { NewApplicationDialog } from "./new-application"
import { PageHeader } from "@/features/shell/page-header"

type Tab = "active" | "saved" | "all"
const tabs: Record<Tab, readonly Status[]> = {
  active: ["applied", "interviewing", "offer"],
  saved: ["saved"],
  all: statuses,
}

type Group = { key: string; label: string; icon: React.ReactNode; items: Application[] }

const groupsFor = (items: Application[], by: Display["groupBy"]): Group[] => {
  switch (by) {
    case "status":
      return statuses.map((s) => ({
        key: s,
        label: statusLabels[s],
        icon: <StatusIcon status={s} />,
        items: items.filter((a) => a.status === s),
      }))
    case "priority":
      return priorities.map((p) => ({
        key: p,
        label: priorityLabels[p],
        icon: <PriorityIcon priority={p} />,
        items: items.filter((a) => a.priority === p),
      }))
    case "goal":
      return [...goals.map((g) => g.id), undefined].map((id) => ({
        key: id ?? "none",
        label: goalName(id),
        icon: <HugeiconsIcon icon={Target02Icon} className="text-muted-foreground size-3.5" />,
        items: items.filter((a) => a.goalId === id),
      }))
    case "none":
      return [{ key: "all", label: "All applications", icon: null, items }]
  }
}

const order: Record<Display["orderBy"], (a: Application, b: Application) => number> = {
  priority: (a, b) => priorities.indexOf(a.priority) - priorities.indexOf(b.priority),
  created: (a, b) => b.createdAt.localeCompare(a.createdAt),
  company: (a, b) => a.company.localeCompare(b.company),
}

const Chip = ({ children }: { children: React.ReactNode }) => (
  <span className="text-muted-foreground flex h-5 items-center gap-1 rounded-full border px-1.5 text-[11px]">
    {children}
  </span>
)

const Properties = ({ a, shown }: { a: Application; shown: Display["shown"] }) => (
  <>
    {shown.includes("priority") && (
      <Chip>
        <PriorityIcon priority={a.priority} />
      </Chip>
    )}
    {shown.includes("goal") && a.goalId && (
      <Chip>
        <HugeiconsIcon icon={Target02Icon} className="size-3" />
        <span className="max-w-28 truncate">{goalName(a.goalId)}</span>
      </Chip>
    )}
    {shown.includes("labels") &&
      a.labels.map((label) => (
        <Chip key={label}>
          <span className="bg-primary/60 size-1.5 rounded-full" />
          {label}
        </Chip>
      ))}
    {shown.includes("location") && <Chip>{a.location}</Chip>}
  </>
)

type Peek = { id?: string; open?: (id: string) => void }

// The first click opens the side panel. Clicking the open card again, or a
// cmd/ctrl/shift click, follows the link to the full page.
const peekOnClick = (peek: Peek, id: string) => (e: React.MouseEvent) => {
  if (!peek.open || peek.id === id || e.metaKey || e.ctrlKey || e.shiftKey) return
  e.preventDefault()
  peek.open(id)
}

const Card = ({ a, shown, peek }: { a: Application; shown: Display["shown"]; peek: Peek }) => (
  <Link
    to="/pipeline/$id"
    params={{ id: a.id }}
    onClick={peekOnClick(peek, a.id)}
    aria-current={peek.id === a.id || undefined}
    className="bg-card hover:border-ring/40 aria-[current=true]:border-ring/70 flex flex-col gap-1.5 rounded-md border px-2.5 py-2 text-[13px] shadow-xs/5"
  >
    <span className="text-muted-foreground flex justify-between text-[11px] empty:hidden">
      {shown.includes("id") && <span>{a.id}</span>}
      {shown.includes("created") && <span>{formatDate(a.createdAt)}</span>}
    </span>
    <span className="flex items-start gap-1.5 leading-snug">
      <StatusIcon status={a.status} className="mt-0.5" />
      <span className="min-w-0">
        <span className="font-medium">{a.role}</span>
        <span className="text-muted-foreground block truncate text-xs">{a.company}</span>
      </span>
    </span>
    <span className="flex flex-wrap gap-1 empty:hidden">
      <Properties a={a} shown={shown} />
    </span>
  </Link>
)

const Row = ({ a, shown, peek }: { a: Application; shown: Display["shown"]; peek: Peek }) => (
  <Link
    to="/pipeline/$id"
    params={{ id: a.id }}
    onClick={peekOnClick(peek, a.id)}
    aria-current={peek.id === a.id || undefined}
    className="hover:bg-accent/50 aria-[current=true]:bg-accent flex h-9 items-center gap-2.5 border-b px-4 text-[13px]"
  >
    {shown.includes("priority") && <PriorityIcon priority={a.priority} />}
    {shown.includes("id") && (
      <span className="text-muted-foreground w-14 shrink-0 text-xs">{a.id}</span>
    )}
    <StatusIcon status={a.status} />
    <span className="min-w-0 truncate">
      <span className="font-medium">{a.role}</span>
      <span className="text-muted-foreground"> · {a.company}</span>
    </span>
    <span className="ms-auto hidden items-center gap-1.5 md:flex">
      <Properties a={a} shown={shown.filter((s) => s !== "priority")} />
    </span>
    {shown.includes("created") && (
      <span className="text-muted-foreground w-14 shrink-0 text-end text-xs">
        {formatDate(a.createdAt)}
      </span>
    )}
  </Link>
)

const IconButton = ({
  label,
  icon,
  ...props
}: { label: string; icon: typeof Layers01Icon } & React.ComponentProps<typeof Button>) => (
  <Tooltip>
    <TooltipTrigger
      render={<Button variant="ghost" size="icon-sm" aria-label={label} {...props} />}
    >
      <HugeiconsIcon icon={icon} />
    </TooltipTrigger>
    <TooltipPopup>{label}</TooltipPopup>
  </Tooltip>
)

const minWidth = 320
const maxWidth = 900
const clamp = (width: number) => Math.round(Math.min(maxWidth, Math.max(minWidth, width)))

// A right-hand panel you resize by dragging its left edge, or with the arrow keys
// when the edge has focus.
const SidePanel = ({
  width,
  onResize,
  children,
}: {
  width: number
  onResize: (width: number) => void
  children: React.ReactNode
}) => {
  const drag = useRef<{ x: number; width: number }>(undefined)
  return (
    <aside
      aria-label="Application details"
      style={{ width }}
      className="bg-background relative shrink-0 border-s"
    >
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize panel"
        aria-valuenow={width}
        aria-valuemin={minWidth}
        aria-valuemax={maxWidth}
        tabIndex={0}
        onPointerDown={(e) => {
          e.preventDefault()
          drag.current = { x: e.clientX, width }
          e.currentTarget.setPointerCapture(e.pointerId)
        }}
        onPointerMove={(e) =>
          drag.current && onResize(clamp(drag.current.width + drag.current.x - e.clientX))
        }
        onPointerUp={() => (drag.current = undefined)}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") onResize(clamp(width + 24))
          if (e.key === "ArrowRight") onResize(clamp(width - 24))
        }}
        className="hover:bg-ring/40 focus-visible:bg-ring/60 absolute inset-y-0 -start-1 z-10 w-2 cursor-col-resize outline-none"
      />
      {children}
    </aside>
  )
}

const panelFields = {
  company: "Company",
  label: "Labels",
  priority: "Priority",
  goal: "Goals",
} as const

// Counts per value of one field; clicking a value toggles it as a filter.
const InsightsPanel = ({
  items,
  filters,
  onChange,
}: {
  items: Application[]
  filters: Filters
  onChange: (filters: Filters) => void
}) => {
  const [field, setField] = useState<keyof typeof panelFields>("company")
  const counts = new Map<string, number>()
  for (const a of items) {
    const values =
      field === "label" ? a.labels : [field === "goal" ? (a.goalId ?? "none") : a[field]]
    for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1)
  }
  const label = (v: string) =>
    field === "goal"
      ? goalName(v === "none" ? undefined : v)
      : field === "priority"
        ? priorityLabels[v as Application["priority"]]
        : v
  return (
    <aside
      aria-label="Insights"
      className="hidden w-72 shrink-0 flex-col gap-3 border-s p-3 lg:flex"
    >
      <ToggleGroup
        size="sm"
        className="flex-wrap"
        value={[field]}
        onValueChange={(v) => v[0] && setField(v[0] as keyof typeof panelFields)}
      >
        {Object.entries(panelFields).map(([value, text]) => (
          <ToggleGroupItem key={value} value={value} className="rounded-full">
            {text}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <ul className="flex flex-col">
        {[...counts.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([value, count]) => (
            <li key={value}>
              <button
                type="button"
                aria-pressed={filters[field as FilterField]?.includes(value) ?? false}
                onClick={() => onChange(toggleFilter(filters, field, value))}
                className="hover:bg-accent aria-pressed:bg-accent flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm"
              >
                <span className="truncate">{label(value)}</span>
                <span className="text-muted-foreground tabular-nums">{count}</span>
              </button>
            </li>
          ))}
      </ul>
    </aside>
  )
}

export const Pipeline = ({ viewId }: { viewId?: string }) => {
  const view = views.find((v) => v.id === viewId)
  const [tab, setTab] = useState<Tab>("all")
  const [filters, setFilters] = useState<Filters>(view?.filters ?? {})
  const [display, setDisplay] = useState<Display>(defaultDisplay)
  const [panel, setPanel] = useState(false)
  const [peek, setPeek] = useState<string>()
  const [peekWidth, setPeekWidth] = useState(440)
  // Phones have no room for a side panel, so cards open the full page there.
  const peeking: Peek = useIsMobile() ? {} : { id: peek, open: setPeek }

  const visible = useApplications()
    .filter((a) => tabs[tab].includes(a.status) && matches(a, filters))
    .sort(order[display.orderBy])
  const groups = groupsFor(visible, display.groupBy).filter(
    (g) => display.showEmpty || g.items.length > 0
  )
  const hasFilters = Object.values(filters).some((v) => v?.length)

  return (
    <div
      className="flex h-svh flex-col md:h-[calc(100svh-1rem)]"
      // Esc closes the side panel from anywhere on the page, unless a menu or dialog is open.
      onKeyDown={(e) =>
        e.key === "Escape" &&
        !(e.target as Element).closest("[role=menu],[role=listbox],[role=dialog]") &&
        setPeek(undefined)
      }
    >
      <PageHeader
        crumbs={[
          { label: "Tracker" },
          ...(view
            ? [{ label: "Pipeline", to: "/pipeline" as const }, { label: view.name }]
            : [{ label: "Pipeline" }]),
        ]}
        actions={
          <NewApplicationDialog
            trigger={
              <Button variant="ghost" size="sm">
                <HugeiconsIcon icon={PlusSignIcon} /> New application
              </Button>
            }
          />
        }
      />
      <div className="flex items-center gap-1 px-3 py-1.5">
        {(Object.keys(tabs) as Tab[]).map((t) => (
          <Button
            key={t}
            size="xs"
            variant={tab === t ? "secondary" : "ghost"}
            aria-pressed={tab === t}
            className="rounded-full capitalize"
            onClick={() => setTab(t)}
          >
            {t}
          </Button>
        ))}
        <IconButton label="Save as view" icon={Layers01Icon} />
        <div className="ms-auto flex items-center gap-1">
          <FilterMenu
            filters={filters}
            onChange={setFilters}
            trigger={
              <Button variant="ghost" size="icon-sm" aria-label="Filter">
                <HugeiconsIcon icon={FilterIcon} />
              </Button>
            }
          />
          <DisplayOptions
            display={display}
            onChange={setDisplay}
            trigger={
              <Button variant="ghost" size="icon-sm" aria-label="Display options">
                <HugeiconsIcon icon={SlidersHorizontalIcon} />
              </Button>
            }
          />
          <IconButton
            label="Insights"
            icon={SidebarRight01Icon}
            aria-pressed={panel}
            onClick={() => setPanel(!panel)}
          />
        </div>
      </div>
      {hasFilters && (
        <div className="flex flex-wrap items-center gap-1.5 border-y px-3 py-1.5">
          <FilterChips filters={filters} onChange={setFilters} />
          <FilterMenu
            filters={filters}
            onChange={setFilters}
            trigger={
              <Button variant="ghost" size="icon-xs" aria-label="Add filter">
                <HugeiconsIcon icon={PlusSignIcon} />
              </Button>
            }
          />
          <Button variant="ghost" size="xs" className="ms-auto" onClick={() => setFilters({})}>
            Clear
          </Button>
          <Button variant="outline" size="xs">
            Save view
          </Button>
        </div>
      )}
      <div className="flex min-h-0 flex-1">
        {visible.length === 0 ? (
          <p className="text-muted-foreground m-auto text-sm">
            No applications match these filters.
          </p>
        ) : display.layout === "board" ? (
          <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto p-2">
            {groups.map((g) => (
              <section
                key={g.key}
                aria-label={g.label}
                className="bg-muted/40 flex w-64 shrink-0 flex-col gap-1.5 rounded-lg p-1.5"
              >
                <header className="flex h-7 items-center gap-1.5 px-1 text-[13px]">
                  {g.icon}
                  <span className="font-medium">{g.label}</span>
                  <span className="text-muted-foreground">{g.items.length}</span>
                  <span className="ms-auto flex">
                    <IconButton label="Group options" icon={MoreHorizontalIcon} size="icon-xs" />
                    <NewApplicationDialog
                      trigger={
                        <Button variant="ghost" size="icon-xs" aria-label={`Add to ${g.label}`}>
                          <HugeiconsIcon icon={PlusSignIcon} />
                        </Button>
                      }
                    />
                  </span>
                </header>
                <div className="flex flex-col gap-1.5 overflow-y-auto">
                  {g.items.map((a) => (
                    <Card key={a.id} a={a} shown={display.shown} peek={peeking} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <div className="min-w-0 flex-1 overflow-y-auto">
            {groups.map((g) => (
              <section key={g.key} aria-label={g.label}>
                <header className="bg-muted/40 flex h-8 items-center gap-2 border-b px-4 text-[13px]">
                  {g.icon}
                  <span className="font-medium">{g.label}</span>
                  <span className="text-muted-foreground">{g.items.length}</span>
                </header>
                {g.items.map((a) => (
                  <Row key={a.id} a={a} shown={display.shown} peek={peeking} />
                ))}
              </section>
            ))}
          </div>
        )}
        {peek ? (
          <SidePanel width={peekWidth} onResize={setPeekWidth}>
            <ApplicationPeek id={peek} onClose={() => setPeek(undefined)} />
          </SidePanel>
        ) : (
          panel && <InsightsPanel items={visible} filters={filters} onChange={setFilters} />
        )}
      </div>
    </div>
  )
}
