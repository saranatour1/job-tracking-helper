import { applicationText, useViewRoutes } from "@/lib/route-ids"
import { Link, useNavigate } from "@tanstack/react-router"

import {
  ContextMenu,
  ContextMenuItem,
  ContextMenuLinkItem,
  ContextMenuPopup,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubPopup,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"

import { type ApplicationCard, type Filters, type View, statusLabels, statuses } from "./data"
import type { Display } from "./display-options"
import { StatusIcon } from "./icons"
import { useRemoveView } from "./saved-views"
import { useSource } from "./source"

// Right-click menus for Applications. Each wraps its target in a trigger that adds no
// box of its own, so the layout stays as it was. Card and view menus stop the event,
// so right-clicking a card opens its menu rather than the board's too.

const copyLink = (search: Record<string, string>) =>
  void navigator.clipboard.writeText(
    `${location.origin}/?${new URLSearchParams(search).toString()}`
  )

/** On a card or row: open it, move it, or look for related roles in Jobs. */
export const ApplicationMenu = ({
  a,
  onOpen,
  onTrashed,
  children,
}: {
  a: ApplicationCard
  onOpen: () => void
  // So the board can close the application's panel when it goes to the Trash.
  onTrashed?: () => void
  children: React.ReactNode
}) => {
  const source = useSource()
  return (
    <ContextMenu>
      <ContextMenuTrigger className="contents" onContextMenu={(e) => e.stopPropagation()}>
        {children}
      </ContextMenuTrigger>
      <ContextMenuPopup className="min-w-52">
        <ContextMenuItem onClick={onOpen}>Open</ContextMenuItem>
        <ContextMenuLinkItem
          render={<Link to="/pipeline/$id" params={{ id: applicationText(a) }} />}
        >
          Open full page
        </ContextMenuLinkItem>
        <ContextMenuSub>
          <ContextMenuSubTrigger>Move to</ContextMenuSubTrigger>
          <ContextMenuSubPopup>
            {statuses.map((s) => (
              <ContextMenuItem
                key={s}
                disabled={a.status === s}
                onClick={() => source.setStatus(a.id, s)}
              >
                <StatusIcon status={s} /> {statusLabels[s]}
              </ContextMenuItem>
            ))}
          </ContextMenuSubPopup>
        </ContextMenuSub>
        {source.real && (
          <>
            <ContextMenuItem onClick={() => source.archive(a.id, !a.archived)}>
              {a.archived ? "Back to the board" : "Archive"}
            </ContextMenuItem>
            <ContextMenuItem
              variant="destructive"
              onClick={() => {
                source.trash(a.id)
                onTrashed?.()
              }}
            >
              Move to Trash
            </ContextMenuItem>
          </>
        )}
        <ContextMenuSeparator />
        <ContextMenuLinkItem render={<Link to="/jobs" search={{ q: a.company }} />}>
          Roles at {a.company} in Jobs
        </ContextMenuLinkItem>
        <ContextMenuLinkItem render={<Link to="/jobs" search={{ q: a.role }} />}>
          Roles like this in Jobs
        </ContextMenuLinkItem>
        {a.url && (
          <ContextMenuLinkItem render={<a href={a.url} target="_blank" rel="noreferrer" />}>
            Open posting
          </ContextMenuLinkItem>
        )}
        <ContextMenuSeparator />
        <ContextMenuItem onClick={() => copyLink({ app: applicationText(a) })}>
          Copy link
        </ContextMenuItem>
      </ContextMenuPopup>
    </ContextMenu>
  )
}

/** On a saved view's tab: open it, start a new one from it, or delete it. */
export const ViewMenu = ({
  view,
  open,
  children,
}: {
  view: View
  open: boolean
  children: React.ReactNode
}) => {
  const remove = useRemoveView()
  const navigate = useNavigate()
  const routes = useViewRoutes()
  return (
    <ContextMenu>
      <ContextMenuTrigger className="contents" onContextMenu={(e) => e.stopPropagation()}>
        {children}
      </ContextMenuTrigger>
      <ContextMenuPopup className="min-w-48">
        <ContextMenuLinkItem render={<Link to="/" search={{ view: routes.text(view.id) }} />}>
          Open
        </ContextMenuLinkItem>
        <ContextMenuLinkItem
          render={
            <Link to="/views/new" search={{ filters: view.filters, display: view.display }} />
          }
        >
          Save as a new view
        </ContextMenuLinkItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          variant="destructive"
          onClick={async () => {
            if (!window.confirm(`Delete the view “${view.name}”?`)) return
            await remove({ id: view.id as never })
            if (open) void navigate({ to: "/" })
          }}
        >
          Delete view
        </ContextMenuItem>
      </ContextMenuPopup>
    </ContextMenu>
  )
}

/** On the board itself: keep what's on screen as a view, or go to the rest of the app. */
export const BoardMenu = ({
  filters,
  display,
  onClear,
  children,
}: {
  filters: Filters
  display: Partial<Display> | undefined
  onClear?: () => void
  children: React.ReactNode
}) => (
  <ContextMenu>
    <ContextMenuTrigger className="contents">{children}</ContextMenuTrigger>
    <ContextMenuPopup className="min-w-48">
      <ContextMenuLinkItem render={<Link to="/views/new" search={{ filters, display }} />}>
        Save as a view
      </ContextMenuLinkItem>
      <ContextMenuItem disabled={!onClear} onClick={onClear}>
        Clear filters
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuLinkItem render={<Link to="/jobs" />}>Jobs</ContextMenuLinkItem>
      <ContextMenuLinkItem render={<Link to="/preferences" />}>Preferences</ContextMenuLinkItem>
      <ContextMenuLinkItem render={<Link to="/calendar" />}>Calendar</ContextMenuLinkItem>
      <ContextMenuLinkItem render={<Link to="/inbox" />}>Updates</ContextMenuLinkItem>
    </ContextMenuPopup>
  </ContextMenu>
)
