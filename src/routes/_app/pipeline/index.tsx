import { createFileRoute, redirect } from "@tanstack/react-router"

// Pipeline is Applications now; old links and bookmarks land there with their view.
export const Route = createFileRoute("/_app/pipeline/")({
  validateSearch: (search: Record<string, unknown>): { view?: string } =>
    typeof search.view === "string" ? { view: search.view } : {},
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/", search, replace: true })
  },
})
