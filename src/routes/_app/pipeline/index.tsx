import { createFileRoute } from "@tanstack/react-router"

import { useViews } from "@/features/tracker/data"
import { Pipeline } from "@/features/tracker/pipeline"

const PipelinePage = () => {
  const { view: viewId } = Route.useSearch()
  const view = useViews().find((v) => v.id === viewId)
  return (
    <Pipeline
      // Keyed so opening another view resets the filters and layout to that view's.
      key={view?.id}
      viewId={view?.id}
      filters={view?.filters}
      display={view?.display}
      crumbs={[
        { label: "Tracker" },
        ...(view
          ? [{ label: "Pipeline", to: "/pipeline" as const }, { label: view.name }]
          : [{ label: "Pipeline" }]),
      ]}
    />
  )
}

export const Route = createFileRoute("/_app/pipeline/")({
  validateSearch: (search: Record<string, unknown>): { view?: string } =>
    typeof search.view === "string" ? { view: search.view } : {},
  component: PipelinePage,
})
