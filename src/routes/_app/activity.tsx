import { createFileRoute } from "@tanstack/react-router"

import { Activity } from "@/features/activity/activity"
import { activitySearch } from "@/features/activity/search"

export const Route = createFileRoute("/_app/activity")({
  validateSearch: activitySearch,
  component: Activity,
})
