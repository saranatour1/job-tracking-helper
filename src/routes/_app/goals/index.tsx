import { createFileRoute } from "@tanstack/react-router"

import { Goals } from "@/features/tracker/goals"
import { ConvexSource } from "@/features/tracker/source"

const GoalsPage = () => (
  <ConvexSource>
    <Goals />
  </ConvexSource>
)

export const Route = createFileRoute("/_app/goals/")({ component: GoalsPage })
