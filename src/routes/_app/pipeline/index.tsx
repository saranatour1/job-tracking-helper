import { createFileRoute } from "@tanstack/react-router"

import { Pipeline } from "@/features/tracker/pipeline"

const PipelinePage = () => {
  const { view } = Route.useSearch()
  // Keyed so opening another view resets the filters to that view's.
  return <Pipeline key={view} viewId={view} />
}

export const Route = createFileRoute("/_app/pipeline/")({
  validateSearch: (search: Record<string, unknown>): { view?: string } =>
    typeof search.view === "string" ? { view: search.view } : {},
  component: PipelinePage,
})
