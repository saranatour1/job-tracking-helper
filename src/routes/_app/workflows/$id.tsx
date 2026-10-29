import { createFileRoute } from "@tanstack/react-router"

import { WorkflowBuilder, workflowSearch } from "@/features/workflows/builder"

// "new" opens an empty builder; saving it moves to the new workflow's own address.
const Page = () => <WorkflowBuilder id={Route.useParams().id} />

export const Route = createFileRoute("/_app/workflows/$id")({
  validateSearch: workflowSearch,
  component: Page,
})
