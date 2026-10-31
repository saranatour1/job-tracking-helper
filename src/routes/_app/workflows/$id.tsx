import { createFileRoute } from "@tanstack/react-router"

import { useRouteId, useWorkflowRoutes } from "@/lib/route-ids"
import { WorkflowBuilder, workflowSearch } from "@/features/workflows/builder"

// "new" opens an empty builder; saving it moves to the new workflow's own address.
const Page = () => {
  const { id: text } = Route.useParams()
  const id = useRouteId(useWorkflowRoutes(), text) ?? text
  return <WorkflowBuilder id={id} />
}

export const Route = createFileRoute("/_app/workflows/$id")({
  validateSearch: workflowSearch,
  component: Page,
})
