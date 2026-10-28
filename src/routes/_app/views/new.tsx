import { createFileRoute } from "@tanstack/react-router"

import { type Filters, filterFields } from "@/features/tracker/data"
import { Pipeline } from "@/features/tracker/pipeline"

const NewViewPage = () => (
  <Pipeline
    crumbs={[{ label: "Views", to: "/views" }, { label: "New view" }]}
    filters={Route.useSearch().filters}
    editor
  />
)

export const Route = createFileRoute("/_app/views/new")({
  // Keeps only known filter fields with string values, since anyone can edit the URL.
  validateSearch: (search: Record<string, unknown>): { filters?: Filters } => {
    const raw = search.filters
    if (!raw || typeof raw !== "object") return {}
    const filters: Filters = {}
    for (const field of filterFields) {
      const values = (raw as Record<string, unknown>)[field]
      if (Array.isArray(values)) filters[field] = values.filter((v) => typeof v === "string")
    }
    return { filters }
  },
  component: NewViewPage,
})
