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
import { Link, useNavigate, useSearch } from "@tanstack/react-router"
import { useRef, useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsList, TabsTab } from "@/components/ui/tabs"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Toolbar, ToolbarButton } from "@/components/ui/toolbar"
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
} from "./data"
import { type Display, DisplayOptions, defaultDisplay } from "./display-options"
import { FilterChips, FilterMenu, toggleFilter } from "./filters"
import { ApplicationPeek } from "./application"
import { PriorityIcon, StatusIcon } from "./icons"
import { MailBadge, UnsortedMail } from "./mail"
import { ApplicationMenu, BoardMenu, ViewMenu } from "./context-menus"
import { useCreateView, useSavedViews } from "./saved-views"
import { displayDiff, type PipelineSearch, type Tab } from "./search"
import { useSource } from "./source"
import { NewApplicationDialog } from "./new-application"
import { type Crumb, PageHeader } from "@/features/shell/page-header"

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
  <Badge
    variant="outline"
    className="text-muted-foreground h-5 gap-1 rounded-full px-1.5 text-[11px] font-normal sm:h-5 sm:text-[11px]"
  >
    {children}
  </Badge>
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

// Cards carry their id when dragged, for a status column to drop them into.
const dragType = "application/x-tracker-id"

const Card = ({ a, shown, peek }: { a: Application; shown: Display["shown"]; peek: Peek }) => (
  <Link
    to="/pipeline/$id"
    params={{ id: a.id }}
    draggable
    onDragStart={(e) => {
      e.dataTransfer.setData(dragType, a.id)
      e.dataTransfer.effectAllowed = "move"
    }}
    onClick={peekOnClick(peek, a.id)}
    aria-current={peek.id === a.id || undefined}
    className="bg-card hover:border-ring/40 aria-[current=true]:border-ring/70 flex flex-col transition-colors duration-150 gap-1.5 rounded-md border px-2.5 py-2 text-[13px] shadow-xs/5"
  >
    <span className="text-muted-foreground flex justify-between text-[11px] empty:hidden">
      {shown.includes("id") && a.code && <span>{a.code}</span>}
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
      <MailBadge id={a.id} />
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
    className="hover:bg-accent/50 aria-[current=true]:bg-accent flex transition-colors duration-150 h-9 items-center gap-2.5 border-b px-4 text-[13px]"
  >
    {shown.includes("priority") && <PriorityIcon priority={a.priority} />}
    {shown.includes("id") && a.code && (
      <span className="text-muted-foreground w-14 shrink-0 text-xs">{a.code}</span>
    )}
    <StatusIcon status={a.status} />
    <span className="min-w-36 flex-1 truncate">
      <span className="font-medium">{a.role}</span>
      <span className="text-muted-foreground"> · {a.company}</span>
    </span>
    <MailBadge id={a.id} />
    <span className="hidden min-w-0 items-center justify-end gap-1.5 overflow-hidden @2xl:flex">
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
      className="bg-background animate-in fade-in slide-in-from-right-6 relative shrink-0 border-s duration-200 ease-out motion-reduce:animate-none"
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
  header,
}: {
  items: Application[]
  filters: Filters
  onChange: (filters: Filters) => void
  header?: React.ReactNode
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
      className="animate-in fade-in slide-in-from-right-6 hidden w-80 shrink-0 border-s duration-200 ease-out motion-reduce:animate-none md:block"
    >
      <ScrollArea>
        <div className="flex flex-col gap-3 p-3">
          {header}
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
        </div>
      </ScrollArea>
    </aside>
  )
}

// The board or list of applications, used by the Pipeline, saved views, goal pages and the
// new-view editor. Each passes its own breadcrumb, starting filters and layout.
export const Pipeline = ({
  crumbs,
  viewId,
  filters: initialFilters = {},
  display: initialDisplay,
  summary,
  editor = false,
}: {
  crumbs: Crumb[]
  viewId?: string
  filters?: Filters
  display?: Partial<Display>
  // Shown at the top of the side panel, which then starts open (a goal's summary).
  summary?: React.ReactNode
  // The new-view editor: name and description fields, and Create view saves the filters.
  editor?: boolean
}) => {
  const navigate = useNavigate()
  const savedViews = useSavedViews()
  // The board's state is the URL's (see search.ts); each setter writes it back, replacing
  // the history entry so Back leaves the page rather than undoing a filter.
  const search = useSearch({ strict: false }) as PipelineSearch
  const write = (patch: Partial<PipelineSearch>) =>
    void navigate({
      to: ".",
      search: ((prev: PipelineSearch) => ({ ...prev, ...patch })) as never,
      replace: true,
    })
  const tab = search.tab ?? "all"
  const setTab = (next: Tab) => write({ tab: next === "all" ? undefined : next })
  const filters = search.filters ?? initialFilters
  const hasInitialFilters = Object.values(initialFilters).some((v) => v?.length)
  // Clearing a view's filters has to say so in the URL, or the view's would come back.
  const setFilters = (next: Filters) =>
    write({
      filters: Object.values(next).some((v) => v?.length)
        ? next
        : hasInitialFilters
          ? {}
          : undefined,
    })
  const baseDisplay: Display = { ...defaultDisplay, ...initialDisplay }
  const display: Display = { ...baseDisplay, ...search.display }
  const setDisplay = (next: Display) => write({ display: displayDiff(next, baseDisplay) })
  const panel = search.insights ?? Boolean(summary)
  const setPanel = (next: boolean) =>
    write({ insights: next === Boolean(summary) ? undefined : next })
  const peek = search.app
  const setPeek = (id: string | undefined) => write({ app: id })
  const [peekWidth, setPeekWidth] = useState(440)
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  // Phones have no room for a side panel, so cards open the full page there.
  const isMobile = useIsMobile()
  const peeking: Peek = isMobile ? {} : { id: peek, open: setPeek }

  const source = useSource()
  // The status column a dragged card is over, to highlight it.
  const [dropOn, setDropOn] = useState<string>()
  const visible = source.applications
    .filter((a) => tabs[tab].includes(a.status) && matches(a, filters))
    .sort(order[display.orderBy])
  const groups = groupsFor(visible, display.groupBy).filter(
    (g) => display.showEmpty || g.items.length > 0
  )
  const hasFilters = Object.values(filters).some((v) => v?.length)

  const saveView = useCreateView()
  const createView = async () => {
    const id = await saveView({
      name: name.trim(),
      description: description.trim(),
      filters: filters as Record<string, string[]>,
      display: displayDiff(display, defaultDisplay),
    })
    void navigate({ to: "/", search: { view: id } })
  }

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
        crumbs={crumbs}
        actions={
          !editor && (
            <NewApplicationDialog
              trigger={
                <Button variant="ghost" size="sm">
                  <HugeiconsIcon icon={PlusSignIcon} /> New application
                </Button>
              }
            />
          )
        }
      />
      {editor && (
        <div className="flex items-start gap-3 border-b px-4 py-3">
          <span className="bg-muted flex size-8 shrink-0 items-center justify-center rounded-md">
            <HugeiconsIcon icon={Layers01Icon} className="size-4" />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <input
              aria-label="View name"
              placeholder="View name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="placeholder:text-muted-foreground bg-transparent text-base font-medium outline-none"
            />
            <input
              aria-label="Description"
              placeholder="Description (optional)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="placeholder:text-muted-foreground bg-transparent text-[13px] outline-none"
            />
          </div>
          <Button variant="ghost" size="sm" render={<Link to="/views" />}>
            Cancel
          </Button>
          <Button size="sm" disabled={!name.trim()} onClick={createView}>
            Create view
          </Button>
        </div>
      )}
      <div className="flex items-center gap-1 overflow-x-auto px-3 py-1.5 [scrollbar-width:none]">
        <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="shrink-0">
          <TabsList size="sm" aria-label="Status">
            {(Object.keys(tabs) as Tab[]).map((t) => (
              <TabsTab key={t} value={t} className="capitalize">
                {t}
              </TabsTab>
            ))}
          </TabsList>
        </Tabs>
        {!editor && !summary && (
          <>
            <span className="bg-border mx-1 h-4 w-px shrink-0" />
            {/* Saved views as tabs; each one is a link, so the URL names the open view. */}
            <Tabs value={viewId ?? null} className="shrink-0">
              <TabsList variant="underline" size="sm" aria-label="Saved views">
                {savedViews.map((v) => (
                  <ViewMenu key={v.id} view={v} open={viewId === v.id}>
                    <TabsTab
                      value={v.id}
                      nativeButton={false}
                      render={<Link to="/" search={{ view: v.id }} />}
                    >
                      {v.name}
                    </TabsTab>
                  </ViewMenu>
                ))}
              </TabsList>
            </Tabs>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label="New view"
                    render={<Link to="/views/new" search={{ filters }} />}
                  />
                }
              >
                <HugeiconsIcon icon={PlusSignIcon} />
              </TooltipTrigger>
              <TooltipPopup>New view from these filters</TooltipPopup>
            </Tooltip>
          </>
        )}
        <div className="ms-auto">
          <UnsortedMail />
        </div>
        {/* One tab stop for the view controls; arrow keys move between them. */}
        <Toolbar aria-label="View controls" className="shrink-0 gap-1 border-0 bg-transparent p-0">
          <FilterMenu
            filters={filters}
            onChange={setFilters}
            trigger={
              <ToolbarButton render={<Button variant="ghost" size="icon-sm" aria-label="Filter" />}>
                <HugeiconsIcon icon={FilterIcon} />
              </ToolbarButton>
            }
          />
          <DisplayOptions
            display={display}
            onChange={setDisplay}
            trigger={
              <ToolbarButton
                render={<Button variant="ghost" size="icon-sm" aria-label="Display options" />}
              >
                <HugeiconsIcon icon={SlidersHorizontalIcon} />
              </ToolbarButton>
            }
          />
          {/* The right panel: an open application closes, else insights (or a goal's
              summary) comes and goes. */}
          <ToolbarButton
            render={
              <IconButton
                label={peek ? "Close panel" : summary ? "Summary" : "Insights"}
                icon={SidebarRight01Icon}
                aria-pressed={Boolean(peek) || panel}
                onClick={() => (peek ? setPeek(undefined) : setPanel(!panel))}
              />
            }
          />
        </Toolbar>
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
          {!editor && (
            <Button
              variant="outline"
              size="xs"
              render={<Link to="/views/new" search={{ filters }} />}
            >
              Save view
            </Button>
          )}
        </div>
      )}
      <div className="flex min-h-0 flex-1">
        <BoardMenu
          filters={filters}
          display={displayDiff(display, defaultDisplay)}
          onClear={hasFilters ? () => setFilters({}) : undefined}
        >
          {visible.length === 0 ? (
            <p className="text-muted-foreground m-auto text-sm">
              No applications match these filters.
            </p>
          ) : display.layout === "board" ? (
            <ScrollArea className="min-w-0 flex-1" fill clampContentMinWidth={false}>
              <div className="flex h-full gap-2 p-2">
                {groups.map((g) => (
                  <section
                    key={g.key}
                    aria-label={g.label}
                    data-drop={dropOn === g.key || undefined}
                    // Dropping a card on a status column moves it there, history and all. Other
                    // groupings have no single value to set, so they don't take drops.
                    {...(display.groupBy === "status" && {
                      onDragOver: (e: React.DragEvent) => {
                        if (!e.dataTransfer.types.includes(dragType)) return
                        e.preventDefault()
                        e.dataTransfer.dropEffect = "move"
                        setDropOn(g.key)
                      },
                      onDragLeave: (e: React.DragEvent) => {
                        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropOn(undefined)
                      },
                      onDrop: (e: React.DragEvent) => {
                        e.preventDefault()
                        setDropOn(undefined)
                        const id = e.dataTransfer.getData(dragType)
                        if (id) source.setStatus(id, g.key as Status)
                      },
                    })}
                    className="bg-muted/40 data-[drop]:bg-accent data-[drop]:ring-ring/40 flex w-64 shrink-0 flex-col gap-1.5 rounded-lg p-1.5 transition-colors data-[drop]:ring-2"
                  >
                    <header className="flex h-7 items-center gap-1.5 px-1 text-[13px]">
                      {g.icon}
                      <span className="font-medium">{g.label}</span>
                      <span className="text-muted-foreground">{g.items.length}</span>
                      <span className="ms-auto flex">
                        <IconButton
                          label="Group options"
                          icon={MoreHorizontalIcon}
                          size="icon-xs"
                        />
                        <NewApplicationDialog
                          trigger={
                            <Button variant="ghost" size="icon-xs" aria-label={`Add to ${g.label}`}>
                              <HugeiconsIcon icon={PlusSignIcon} />
                            </Button>
                          }
                        />
                      </span>
                    </header>
                    <ScrollArea className="-me-1.5 pe-1.5">
                      <div className="flex flex-col gap-1.5">
                        {g.items.map((a) => (
                          <ApplicationMenu key={a.id} a={a} onOpen={() => setPeek(a.id)}>
                            <Card a={a} shown={display.shown} peek={peeking} />
                          </ApplicationMenu>
                        ))}
                      </div>
                    </ScrollArea>
                  </section>
                ))}
              </div>
            </ScrollArea>
          ) : (
            <ScrollArea className="@container min-w-0 flex-1">
              {groups.map((g) => (
                <section key={g.key} aria-label={g.label}>
                  <header className="bg-muted/40 flex h-8 items-center gap-2 border-b px-4 text-[13px]">
                    {g.icon}
                    <span className="font-medium">{g.label}</span>
                    <span className="text-muted-foreground">{g.items.length}</span>
                  </header>
                  {g.items.map((a) => (
                    <ApplicationMenu key={a.id} a={a} onOpen={() => setPeek(a.id)}>
                      <Row a={a} shown={display.shown} peek={peeking} />
                    </ApplicationMenu>
                  ))}
                </section>
              ))}
            </ScrollArea>
          )}
        </BoardMenu>
        {peek ? (
          <SidePanel width={peekWidth} onResize={setPeekWidth}>
            <ApplicationPeek id={peek} onClose={() => setPeek(undefined)} />
          </SidePanel>
        ) : (
          panel && (
            <InsightsPanel
              items={visible}
              filters={filters}
              onChange={setFilters}
              header={summary}
            />
          )
        )}
      </div>
    </div>
  )
}
