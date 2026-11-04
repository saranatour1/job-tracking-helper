import { ArrowRight01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { Link, type LinkProps } from "@tanstack/react-router"
import { Fragment } from "react"
import { createPortal } from "react-dom"

import { SidebarTrigger } from "@/components/ui/sidebar"
import { cn } from "@/lib/utils"

export type Crumb = {
  label: string
  to?: LinkProps["to"]
  params?: LinkProps["params"]
  search?: LinkProps["search"]
}

// A plain element rather than a ref, so a page can fill the bar on its first render instead
// of showing an empty bar for a frame. Pages only render in the browser, behind sign-in.
let slot: HTMLElement | undefined
const barSlot = () => {
  slot ??= Object.assign(document.createElement("div"), {
    className: "flex min-w-0 flex-1 items-center gap-2",
  })
  return slot
}

/** The top bar of every page, kept by the layout: the sidebar toggle, then what the page puts in. */
export const PageBar = () => (
  <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
    <SidebarTrigger />
    <div ref={(el) => el?.append(barSlot())} className="contents" />
  </header>
)

/** The trail of pages up to this one, each a link but the last. In the bar the last is the page
 * heading; on a page with its own heading it's plain text. */
export const Breadcrumbs = ({
  crumbs,
  heading = false,
  className,
}: {
  crumbs: Crumb[]
  heading?: boolean
  className?: string
}) => (
  <nav
    aria-label="Breadcrumb"
    className={cn("flex min-w-0 items-center gap-1.5 text-sm", className)}
  >
    {crumbs.map((crumb, i) => (
      <Fragment key={crumb.label}>
        {i > 0 && (
          <HugeiconsIcon
            icon={ArrowRight01Icon}
            className="text-muted-foreground size-3.5 shrink-0"
          />
        )}
        {i < crumbs.length - 1 ? (
          <Link
            to={crumb.to}
            params={crumb.params}
            search={crumb.search}
            className="text-muted-foreground hover:text-foreground truncate"
          >
            {crumb.label}
          </Link>
        ) : heading ? (
          <h1 className="truncate font-medium">{crumb.label}</h1>
        ) : (
          <span aria-current="page" className="truncate">
            {crumb.label}
          </span>
        )}
      </Fragment>
    ))}
  </nav>
)

// What a page puts in the bar: the breadcrumb and the page actions. Through a portal, the
// actions still see the page's context and events.
export const PageHeader = ({ crumbs, actions }: { crumbs: Crumb[]; actions?: React.ReactNode }) =>
  createPortal(
    <>
      <Breadcrumbs crumbs={crumbs} heading />
      <div className="ms-auto flex items-center gap-1">{actions}</div>
    </>,
    barSlot()
  )
