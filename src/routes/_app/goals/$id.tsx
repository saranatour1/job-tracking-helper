import { createFileRoute } from "@tanstack/react-router"

import { useGoalRoutes, useRouteId } from "@/lib/route-ids"
import { GoalDetail } from "@/features/tracker/goals"
import { pipelineSearch } from "@/features/tracker/search"
import { ConvexSource } from "@/features/tracker/source"

const GoalPage = () => {
  const { id: text } = Route.useParams()
  const id = useRouteId(useGoalRoutes(), text) ?? text
  return (
    <ConvexSource>
      <GoalDetail id={id} />
    </ConvexSource>
  )
}

export const Route = createFileRoute("/_app/goals/$id")({
  validateSearch: pipelineSearch,
  component: GoalPage,
})
