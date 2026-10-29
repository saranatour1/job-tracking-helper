import {
  DashboardSquare01Icon,
  LeftToRightListBulletIcon,
  PlusSignIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { Link } from "@tanstack/react-router"

import { Button } from "@/components/ui/button"
import { PageHeader } from "@/features/shell/page-header"

import { type FilterField, matches, optionLabel } from "./data"
import { groupings } from "./display-options"
import { fieldLabels } from "./filters"
import { useSavedViews } from "./saved-views"
import { useSource } from "./source"

// Saved views. Each opens in Applications with its own filters and layout.
export const Views = () => {
  const views = useSavedViews()
  const { applications, loaded } = useSource()
  return (
    <>
      <PageHeader
        crumbs={[{ label: "Tracker" }, { label: "Views" }]}
        actions={
          <Button variant="ghost" size="sm" render={<Link to="/views/new" />}>
            <HugeiconsIcon icon={PlusSignIcon} /> New view
          </Button>
        }
      />
      <ul className="flex flex-col">
        {loaded && views.length === 0 && (
          <li className="text-muted-foreground p-6 text-center text-[13px]">
            No views yet. Filter Applications, then right-click and save it as a view.
          </li>
        )}
        {views.map((view) => {
          const list = view.display?.layout === "list"
          return (
            <li key={view.id} className="border-b">
              <Link
                to="/"
                search={{ view: view.id }}
                className="hover:bg-accent/50 flex items-center gap-3 px-4 py-2.5 transition-colors"
              >
                <HugeiconsIcon
                  icon={list ? LeftToRightListBulletIcon : DashboardSquare01Icon}
                  className="text-muted-foreground size-4 shrink-0"
                />
                <span className="flex min-w-0 flex-col">
                  <span className="text-[13px] font-medium">{view.name}</span>
                  <span className="text-muted-foreground truncate text-xs">
                    {Object.entries(view.filters)
                      .filter(([, values]) => values?.length)
                      .map(
                        ([field, values]) =>
                          `${fieldLabels[field as FilterField]} is ${values!.map((v) => optionLabel(field as FilterField, v)).join(" or ")}`
                      )
                      .join(" · ") || "No filters"}
                  </span>
                </span>
                <span className="text-muted-foreground ms-auto hidden shrink-0 text-xs sm:inline">
                  {list ? "List" : "Board"} · {groupings[view.display?.groupBy ?? "status"]}
                </span>
                <span className="text-muted-foreground w-8 shrink-0 text-end text-[13px] tabular-nums">
                  {applications.filter((a) => matches(a, view.filters)).length}
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </>
  )
}
