import { api } from "@/lib/api"
import {
  CheckmarkCircle02Icon,
  InboxIcon,
  Mail01Icon,
  MailOpen01Icon,
  SlidersHorizontalIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { Link, useNavigate, useSearch } from "@tanstack/react-router"
import type { FunctionReturnType } from "convex/server"
import { useMutation } from "convex/react"
import { useQuery } from "convex-helpers/react/cache/hooks"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Menu,
  MenuGroup,
  MenuGroupLabel,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuTrigger,
} from "@/components/ui/menu"
import { ScrollArea } from "@/components/ui/scroll-area"
import { PageHeader } from "@/features/shell/page-header"
import { statusLabels, statuses } from "@/features/tracker/data"
import { StatusIcon } from "@/features/tracker/icons"
import { cn } from "@/lib/utils"

type Line = FunctionReturnType<typeof api.inbox.inbox>[number]

const tabs = { unread: "Unread", read: "Read", all: "All" }
type Tab = keyof typeof tabs
const groupings = { none: "No grouping", status: "Application status", company: "Company" }
type Grouping = keyof typeof groupings

// The tab, grouping and open line live in the URL, so a reload keeps your place.
export const inboxSearch = (
  search: Record<string, unknown>
): { tab?: Tab; group?: Grouping; id?: string } => ({
  tab: (Object.keys(tabs) as Tab[]).find((t) => t === search.tab),
  group: (Object.keys(groupings) as Grouping[]).find((g) => g === search.group),
  id: typeof search.id === "string" ? search.id : undefined,
})

/** The unread count for the sidebar badge. */
export const useUnreadCount = () => useQuery(api.inbox.unreadCount) ?? 0

const agoOf = (at: number) => {
  const minutes = Math.round((Date.now() - at) / 60_000)
  if (minutes < 60) return minutes < 1 ? "now" : `${minutes}m`
  if (minutes < 60 * 24) return `${Math.round(minutes / 60)}h`
  return `${Math.round(minutes / 60 / 24)}d`
}

const groupKey = (n: Line, by: Grouping) =>
  by === "status" ? (n.status ?? "") : by === "company" ? (n.company ?? "") : ""

const LineRow = ({
  n,
  selected,
  onSelect,
  onToggle,
}: {
  n: Line
  selected: boolean
  onSelect: () => void
  onToggle: () => void
}) => (
  <li className="group relative border-b">
    <button
      type="button"
      aria-current={selected}
      onClick={onSelect}
      className="hover:bg-accent/50 aria-[current=true]:bg-accent flex w-full items-center gap-2.5 px-3 py-2 text-start transition-colors duration-150"
    >
      <span
        className={cn("size-1.5 shrink-0 rounded-full", n.unread ? "bg-primary" : "bg-transparent")}
      />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className={cn("truncate text-[13px]", n.unread && "font-medium")}>{n.title}</span>
        <span className="text-muted-foreground truncate text-xs">{n.message}</span>
      </span>
      <span className="flex shrink-0 items-center gap-1.5 group-hover:invisible">
        {n.status && <StatusIcon status={n.status} />}
        <span className="text-muted-foreground w-9 text-end text-xs">{agoOf(n.at)}</span>
      </span>
    </button>
    <Button
      variant="ghost"
      size="icon-xs"
      aria-label={n.unread ? "Mark as read" : "Mark as unread"}
      onClick={onToggle}
      className="absolute end-3 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
    >
      <HugeiconsIcon icon={n.unread ? MailOpen01Icon : Mail01Icon} />
    </Button>
  </li>
)

export const Inbox = () => {
  const loaded = useQuery(api.inbox.inbox)
  const all = loaded ?? []
  const setRead = useMutation(api.inbox.setRead)
  const search = useSearch({ from: "/_app/inbox" })
  const navigate = useNavigate({ from: "/inbox" })
  const tab = search.tab ?? "unread"
  const groupBy = search.group ?? "none"
  const go = (next: typeof search) =>
    void navigate({ search: (prev) => ({ ...prev, ...next }), replace: true })

  const unread = all.filter((n) => n.unread)
  const shown = all.filter((n) => tab === "all" || n.unread === (tab === "unread"))
  const keys =
    groupBy === "status"
      ? statuses.filter((s) => shown.some((n) => groupKey(n, "status") === s))
      : [...new Set(shown.map((n) => groupKey(n, groupBy)))].sort()
  const note = all.find((n) => n.id === search.id)
  const toggle = (n: Line) => void setRead({ ids: [n.id], read: n.unread })

  // Opening a notification marks it read, like an email inbox.
  const select = (n: Line) => {
    go({ id: n.id })
    if (n.unread) void setRead({ ids: [n.id], read: true })
  }

  return (
    <div className="flex h-svh flex-col md:h-[calc(100svh-1rem)]">
      <PageHeader
        crumbs={[{ label: "Updates" }]}
        actions={
          <Button
            variant="ghost"
            size="sm"
            disabled={unread.length === 0}
            onClick={() => void setRead({ read: true })}
          >
            <HugeiconsIcon icon={CheckmarkCircle02Icon} /> Mark all as read
          </Button>
        }
      />
      <div className="flex min-h-0 flex-1">
        <div className="flex w-full flex-col border-e md:w-[26rem] md:shrink-0">
          <div className="flex items-center gap-1 border-b px-3 py-1.5">
            {(Object.keys(tabs) as Tab[]).map((t) => (
              <Button
                key={t}
                size="xs"
                variant={tab === t ? "secondary" : "ghost"}
                aria-pressed={tab === t}
                className="rounded-full"
                onClick={() => go({ tab: t })}
              >
                {tabs[t]}
                {t === "unread" && unread.length > 0 && (
                  <Badge variant="secondary" size="sm">
                    {unread.length}
                  </Badge>
                )}
              </Button>
            ))}
            <Menu>
              <MenuTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Group by"
                    className="ms-auto"
                  />
                }
              >
                <HugeiconsIcon icon={SlidersHorizontalIcon} />
              </MenuTrigger>
              <MenuPopup align="end">
                <MenuGroup>
                  <MenuGroupLabel>Group by</MenuGroupLabel>
                  <MenuRadioGroup
                    value={groupBy}
                    onValueChange={(v) => go({ group: v as Grouping })}
                  >
                    {Object.entries(groupings).map(([value, label]) => (
                      <MenuRadioItem key={value} value={value}>
                        {label}
                      </MenuRadioItem>
                    ))}
                  </MenuRadioGroup>
                </MenuGroup>
              </MenuPopup>
            </Menu>
          </div>
          <ScrollArea className="min-h-0 flex-1">
            {!loaded ? null : shown.length === 0 ? (
              <p className="text-muted-foreground p-6 text-center text-[13px]">
                {tab === "unread" ? "You're all caught up." : "No notifications here yet."}
              </p>
            ) : (
              keys.map((key) => (
                <section key={key} aria-label={key || "Notifications"}>
                  {groupBy !== "none" && (
                    <h2 className="bg-muted/40 text-muted-foreground flex h-7 items-center gap-1.5 border-b px-3 text-xs">
                      {groupBy === "status" && key && (
                        <StatusIcon status={key as (typeof statuses)[number]} />
                      )}
                      {groupBy === "status"
                        ? (statusLabels[key as (typeof statuses)[number]] ??
                          "Not about an application")
                        : key || "Not about an application"}
                    </h2>
                  )}
                  <ul>
                    {shown
                      .filter((n) => groupKey(n, groupBy) === key)
                      .map((n) => (
                        <LineRow
                          key={n.id}
                          n={n}
                          selected={search.id === n.id}
                          onSelect={() => select(n)}
                          onToggle={() => toggle(n)}
                        />
                      ))}
                  </ul>
                </section>
              ))
            )}
          </ScrollArea>
        </div>
        <section className="hidden flex-1 items-center justify-center md:flex">
          {note ? (
            <div className="flex w-full max-w-md flex-col gap-3 p-6">
              <span className="text-muted-foreground text-xs">
                {agoOf(note.at) === "now" ? "Just now" : `${agoOf(note.at)} ago`}
              </span>
              <h2 className="font-heading text-lg font-semibold">{note.title}</h2>
              <p className="text-[13px]">{note.message}</p>
              {note.status && (
                <p className="text-muted-foreground flex items-center gap-2 text-[13px]">
                  <StatusIcon status={note.status} /> {statusLabels[note.status]}
                </p>
              )}
              <div className="flex gap-2">
                {"run" in note && note.run && (
                  <Button
                    variant="outline"
                    size="sm"
                    render={
                      <Link
                        to="/workflows/$id"
                        params={{ id: note.run.automationId }}
                        search={{ tab: "history", run: note.run.runId }}
                      />
                    }
                  >
                    Open the run
                  </Button>
                )}
                {note.link && (
                  <Button variant="outline" size="sm" render={<Link to={note.link} />}>
                    {note.link === "/loops"
                      ? "Open loops"
                      : note.link === "/calendar"
                        ? "Open calendar"
                        : note.link === "/prefilled"
                          ? "Open prefilled applications"
                          : "Open applications"}
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={() => toggle(note)}>
                  Mark as {note.unread ? "read" : "unread"}
                </Button>
              </div>
            </div>
          ) : (
            <div className="text-muted-foreground flex flex-col items-center gap-3">
              <HugeiconsIcon icon={InboxIcon} className="size-14 stroke-1" />
              <p className="text-[13px]">
                {unread.length ? `${unread.length} unread notifications` : "You're all caught up"}
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
