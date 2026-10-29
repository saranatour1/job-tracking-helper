import { createFileRoute } from "@tanstack/react-router"

import { useViews } from "@/features/tracker/data"
import { Pipeline } from "@/features/tracker/pipeline"
import { ConvexSource } from "@/features/tracker/source"

// Applications: every application as a board or list, with its mail in each side panel.
// A saved view opens here too, as ?view=.
const ApplicationsPage = () => {
  const { view: viewId } = Route.useSearch()
  const view = useViews().find((v) => v.id === viewId)
  return (
    <ConvexSource>
      <Pipeline
        // Keyed so opening another view resets the filters and layout to that view's.
        key={view?.id}
        viewId={view?.id}
        filters={view?.filters}
        display={view?.display}
        crumbs={
          view
            ? [{ label: "Applications", to: "/" as const }, { label: view.name }]
            : [{ label: "Applications" }]
        }
      />
    </ConvexSource>
  )
}

export const Route = createFileRoute("/_app/")({
  validateSearch: (search: Record<string, unknown>): { view?: string } =>
    typeof search.view === "string" ? { view: search.view } : {},
  component: ApplicationsPage,
})
