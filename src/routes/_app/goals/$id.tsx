import { createFileRoute } from "@tanstack/react-router"

import { pipelineSearch } from "@/features/tracker/search"

import { GoalDetail } from "@/features/tracker/goals"

const GoalPage = () => <GoalDetail id={Route.useParams().id} />

export const Route = createFileRoute("/_app/goals/$id")({
  validateSearch: pipelineSearch,
  component: GoalPage,
})
