import { createFileRoute } from "@tanstack/react-router"

import { Pipeline } from "@/features/tracker/pipeline"
import { pipelineSearch } from "@/features/tracker/search"
import { ConvexSource } from "@/features/tracker/source"

// The board in editor mode: whatever filters and display are in the URL become the view.
const NewViewPage = () => (
  <ConvexSource>
    <Pipeline crumbs={[{ label: "Views", to: "/views" }, { label: "New view" }]} editor />
  </ConvexSource>
)

export const Route = createFileRoute("/_app/views/new")({
  validateSearch: pipelineSearch,
  component: NewViewPage,
})
