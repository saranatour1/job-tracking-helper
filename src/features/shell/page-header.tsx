import { ArrowRight01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { Link, type LinkProps } from "@tanstack/react-router"
import { PanelLeftIcon } from "lucide-react"
import { Fragment } from "react"

import { Button } from "@/components/ui/button"
import { SidebarTrigger } from "@/components/ui/sidebar"

export type Crumb = { label: string; to?: LinkProps["to"]; params?: LinkProps["params"] }

// The top bar of every page holds the sidebar toggle, the breadcrumb and the page
// actions. The last crumb is the page heading. A page with its own side panel passes
// `onSidebar`, so the same button switches between the two sidebars.
export const PageHeader = ({
  crumbs,
  actions,
  onSidebar,
}: {
  crumbs: Crumb[]
  actions?: React.ReactNode
  onSidebar?: () => void
}) => (
  <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
    {onSidebar ? (
      <Button size="icon" variant="ghost" className="size-7" onClick={onSidebar}>
        <PanelLeftIcon />
        <span className="sr-only">Toggle Sidebar</span>
      </Button>
    ) : (
      <SidebarTrigger />
    )}
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
  </header>
)
