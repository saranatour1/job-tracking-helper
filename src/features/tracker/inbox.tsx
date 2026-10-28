import {
  CheckmarkCircle02Icon,
  InboxIcon,
  Mail01Icon,
  MailOpen01Icon,
  SlidersHorizontalIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { Link } from "@tanstack/react-router"
import { useState, useSyncExternalStore } from "react"

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
import { PageHeader } from "@/features/shell/page-header"
import { cn } from "@/lib/utils"

import {
  type Notification,
  type Status,
  ago,
  findApplication,
  notifications,
  statusLabels,
  statuses,
} from "./data"
import { StatusIcon } from "./icons"

// shortcut: read state lives in memory and resets on reload; move it to Convex with the rest.
// It sits in a module-level store so the sidebar badge and the inbox show the same count.
let state = notifications
const listeners = new Set<() => void>()
const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
const setUnread = (ids: string[], unread: boolean) => {
  state = state.map((n) => (ids.includes(n.id) ? { ...n, unread } : n))
  for (const listener of listeners) listener()
}
const useNotifications = () =>
  useSyncExternalStore(
    subscribe,
    () => state,
    () => notifications
  )
export const useUnreadCount = () => useNotifications().filter((n) => n.unread).length

const tabs = { unread: "Unread", read: "Read", all: "All" }
type Tab = keyof typeof tabs
const groupings = { none: "No grouping", status: "Application status", company: "Company" }
type Grouping = keyof typeof groupings

const groupKey = (n: Notification, by: Grouping) => {
  const app = findApplication(n.applicationId)
  return by === "status" ? (app?.status ?? "") : by === "company" ? (app?.company ?? "") : ""
}

const NotificationRow = ({
  n,
  selected,
  onSelect,
}: {
  n: Notification
  selected: boolean
  onSelect: () => void
}) => {
  const app = findApplication(n.applicationId)
  return (
    <li className="group relative border-b">
      <button
        type="button"
        aria-current={selected}
        onClick={onSelect}
        className="hover:bg-accent/50 aria-[current=true]:bg-accent flex w-full items-center gap-2.5 px-3 py-2 text-start"
      >
        <span
          className={cn(
            "size-1.5 shrink-0 rounded-full",
            n.unread ? "bg-primary" : "bg-transparent"
          )}
        />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex min-w-0 items-center gap-1.5 text-[13px]">
            <span className="text-muted-foreground shrink-0 text-xs">{app?.id}</span>
            <span className={cn("truncate", n.unread && "font-medium")}>
              {app?.role}
              <span className="text-muted-foreground font-normal"> · {app?.company}</span>
            </span>
          </span>
          <span className="text-muted-foreground truncate text-xs">{n.message}</span>
        </span>
        <span className="flex shrink-0 items-center gap-1.5 group-hover:invisible">
          {app && <StatusIcon status={app.status} />}
          <span className="text-muted-foreground w-9 text-end text-xs">{ago(n.at)}</span>
        </span>
      </button>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={n.unread ? "Mark as read" : "Mark as unread"}
        onClick={() => setUnread([n.id], !n.unread)}
        className="absolute end-3 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
      >
        <HugeiconsIcon icon={n.unread ? MailOpen01Icon : Mail01Icon} />
      </Button>
    </li>
  )
}

export const Inbox = () => {
  const all = useNotifications()
  const [tab, setTab] = useState<Tab>("unread")
  const [groupBy, setGroupBy] = useState<Grouping>("none")
  const [selected, setSelected] = useState<string>()

  const unread = all.filter((n) => n.unread)
  const shown = all.filter((n) => tab === "all" || n.unread === (tab === "unread"))
  const keys =
    groupBy === "status"
      ? statuses.filter((s) => shown.some((n) => groupKey(n, "status") === s))
      : [...new Set(shown.map((n) => groupKey(n, groupBy)))].sort()
  const note = all.find((n) => n.id === selected)
  const a = note && findApplication(note.applicationId)

  // Opening a notification marks it read, like an email inbox.
  const select = (n: Notification) => {
    setSelected(n.id)
    if (n.unread) setUnread([n.id], false)
  }

  return (
    <div className="flex h-svh flex-col md:h-[calc(100svh-1rem)]">
      <PageHeader
        crumbs={[{ label: "Inbox" }]}
        actions={
          <Button
            variant="ghost"
            size="sm"
            disabled={unread.length === 0}
            onClick={() =>
              setUnread(
                unread.map((n) => n.id),
                false
              )
            }
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
                onClick={() => setTab(t)}
              >
                {tabs[t]}
                {t === "unread" && unread.length > 0 && (
                  <span className="text-muted-foreground">{unread.length}</span>
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
                  <MenuRadioGroup value={groupBy} onValueChange={(v) => setGroupBy(v as Grouping)}>
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
          <div className="flex-1 overflow-y-auto">
            {shown.length === 0 ? (
              <p className="text-muted-foreground p-6 text-center text-[13px]">
                {tab === "unread" ? "You're all caught up." : "No notifications here yet."}
              </p>
            ) : (
              keys.map((key) => (
                <section key={key} aria-label={key || "Notifications"}>
                  {groupBy !== "none" && (
                    <h2 className="bg-muted/40 text-muted-foreground flex h-7 items-center gap-1.5 border-b px-3 text-xs">
                      {groupBy === "status" && <StatusIcon status={key as Status} />}
                      {groupBy === "status" ? statusLabels[key as Status] : key}
                    </h2>
                  )}
                  <ul>
                    {shown
                      .filter((n) => groupKey(n, groupBy) === key)
                      .map((n) => (
                        <NotificationRow
                          key={n.id}
                          n={n}
                          selected={selected === n.id}
                          onSelect={() => select(n)}
                        />
                      ))}
                  </ul>
                </section>
              ))
            )}
          </div>
        </div>
        <section className="hidden flex-1 items-center justify-center md:flex">
          {note && a ? (
            <div className="flex w-full max-w-md flex-col gap-3 p-6">
              <span className="text-muted-foreground text-xs">
                {a.id} · {ago(note.at)}
              </span>
              <h2 className="font-heading text-lg font-semibold">
                {a.role} <span className="text-muted-foreground font-normal">at {a.company}</span>
              </h2>
              <p className="text-[13px]">{note.message}</p>
              <p className="text-muted-foreground flex items-center gap-2 text-[13px]">
                <StatusIcon status={a.status} /> {statusLabels[a.status]}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  render={<Link to="/pipeline/$id" params={{ id: a.id }} />}
                >
                  Open application
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setUnread([note.id], !note.unread)}
                >
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
