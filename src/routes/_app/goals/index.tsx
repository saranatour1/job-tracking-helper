import { createFileRoute } from "@tanstack/react-router"

import { Goals } from "@/features/tracker/goals"

export const Route = createFileRoute("/_app/goals/")({ component: Goals })
