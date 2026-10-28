import { Layers01Icon, PlusSignIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { Link } from "@tanstack/react-router"

import { Button } from "@/components/ui/button"

import { type FilterField, applications, matches, optionLabel, views } from "./data"
import { fieldLabels } from "./filters"
import { PageHeader } from "@/features/shell/page-header"

// Saved filter sets. Opening one loads its filters into the pipeline.
export const Views = () => (
  <>
    <PageHeader
      crumbs={[{ label: "Tracker" }, { label: "Views" }]}
      actions={
        <Button variant="ghost" size="sm">
          <HugeiconsIcon icon={PlusSignIcon} /> New view
        </Button>
      }
    />
    <ul className="flex flex-col">
      {views.map((view) => (
        <li key={view.id} className="border-b">
          <Link
            to="/pipeline"
            search={{ view: view.id }}
            className="hover:bg-accent/50 flex items-center gap-3 px-4 py-3"
          >
            <HugeiconsIcon icon={Layers01Icon} className="text-muted-foreground size-4 shrink-0" />
            <span className="flex min-w-0 flex-col">
              <span className="text-sm font-medium">{view.name}</span>
              <span className="text-muted-foreground truncate text-xs">
                {Object.entries(view.filters)
                  .map(
                    ([field, values]) =>
                      `${fieldLabels[field as FilterField]} is ${values!.map((v) => optionLabel(field as FilterField, v)).join(" or ")}`
                  )
                  .join(" · ")}
              </span>
            </span>
            <span className="text-muted-foreground ms-auto text-sm tabular-nums">
              {applications.filter((a) => matches(a, view.filters)).length}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  </>
)
