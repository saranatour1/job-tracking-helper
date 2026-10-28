import { createFileRoute } from "@tanstack/react-router"

import { GoalDetail } from "@/features/tracker/goals"

const GoalPage = () => <GoalDetail id={Route.useParams().id} />

export const Route = createFileRoute("/_app/goals/$id")({ component: GoalPage })
