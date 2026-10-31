import { ArrowRight01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { Link, type LinkProps } from "@tanstack/react-router"
import { Fragment } from "react"
import { createPortal } from "react-dom"

import { SidebarTrigger } from "@/components/ui/sidebar"

export type Crumb = { label: string; to?: LinkProps["to"]; params?: LinkProps["params"] }

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

// What a page puts in the bar: the breadcrumb and the page actions. The last crumb is the
// page heading. Through a portal, the actions still see the page's context and events.
export const PageHeader = ({ crumbs, actions }: { crumbs: Crumb[]; actions?: React.ReactNode }) =>
  createPortal(
    <>
      <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-sm">
        {crumbs.map((crumb, i) => (
          <Fragment key={crumb.label}>
            {i > 0 && (
              <HugeiconsIcon icon={ArrowRight01Icon} className="text-muted-foreground size-3.5" />
            )}
            {i === crumbs.length - 1 ? (
              <h1 className="truncate font-medium">{crumb.label}</h1>
            ) : (
              <Link
                to={crumb.to}
                params={crumb.params}
                className="text-muted-foreground hover:text-foreground truncate"
              >
                {crumb.label}
              </Link>
            )}
          </Fragment>
        ))}
      </nav>
      <div className="ms-auto flex items-center gap-1">{actions}</div>
    </>,
    barSlot()
  )
