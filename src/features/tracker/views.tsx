import {
  DashboardSquare01Icon,
  LeftToRightListBulletIcon,
  PlusSignIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { Link } from "@tanstack/react-router"

import { Button } from "@/components/ui/button"
import { addTile, chip, PageIntro, pageBody, tile, tileGrid } from "@/features/shell/page-body"
import { PageHeader } from "@/features/shell/page-header"
import { cn } from "@/lib/utils"

import { type FilterField, applications, matches, optionLabel, useViews } from "./data"
import { groupings } from "./display-options"
import { fieldLabels } from "./filters"

// Saved views. Each opens in the pipeline with its own filters and layout.
export const Views = () => (
  <>
    <PageHeader
      crumbs={[{ label: "Tracker" }, { label: "Views" }]}
      actions={
        <Button variant="ghost" size="sm" render={<Link to="/views/new" />}>
          <HugeiconsIcon icon={PlusSignIcon} /> New view
        </Button>
      }
    />
    <main className={pageBody}>
      <PageIntro
        title="Views"
        description="Saved filters and layouts. Each one opens in Pipeline."
      />
      <ul className={tileGrid}>
        {useViews().map((view) => {
          const list = view.display?.layout === "list"
          return (
            <li key={view.id} className="flex">
              <Link
                to="/pipeline"
                search={{ view: view.id }}
                className={cn(tile, "hover:bg-accent/30 flex-1 transition-colors")}
              >
                <span className="flex items-center gap-2">
                  <span className={cn(chip, "flex min-w-0 items-center gap-1.5")}>
                    <HugeiconsIcon
                      icon={list ? LeftToRightListBulletIcon : DashboardSquare01Icon}
                      className="text-muted-foreground size-3.5 shrink-0"
                    />
                    <span className="truncate">{view.name}</span>
                  </span>
                  <span className="text-muted-foreground ms-auto shrink-0 text-xs">
                    {list ? "List" : "Board"} · {groupings[view.display?.groupBy ?? "status"]}
                  </span>
                </span>
                <span className="flex flex-col gap-0.5 px-1">
                  <span className="text-muted-foreground text-xs">
                    {Object.entries(view.filters)
                      .filter(([, values]) => values?.length)
                      .map(
                        ([field, values]) =>
                          `${fieldLabels[field as FilterField]} is ${values!.map((v) => optionLabel(field as FilterField, v)).join(" or ")}`
                      )
                      .join(" · ") || "No filters"}
                  </span>
                  <span className="text-[13px]">
                    <span className="font-medium tabular-nums">
                      {applications.filter((a) => matches(a, view.filters)).length}
                    </span>{" "}
                    applications
                  </span>
                </span>
              </Link>
            </li>
          )
        })}
        <li className="flex">
          <Link to="/views/new" className={cn(addTile, "flex-1")}>
            <HugeiconsIcon icon={PlusSignIcon} className="size-4" /> New view
          </Link>
        </li>
      </ul>
    </main>
  </>
)
