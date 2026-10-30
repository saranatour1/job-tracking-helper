import { createFileRoute } from "@tanstack/react-router"

import { GoalDetail } from "@/features/tracker/goals"
import { pipelineSearch } from "@/features/tracker/search"
import { ConvexSource } from "@/features/tracker/source"

const GoalPage = () => (
  <ConvexSource>
    <GoalDetail id={Route.useParams().id} />
  </ConvexSource>
)

export const Route = createFileRoute("/_app/goals/$id")({
  validateSearch: pipelineSearch,
  component: GoalPage,
})
