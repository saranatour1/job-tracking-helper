import { createFileRoute } from "@tanstack/react-router"

import { Activity, activitySearch } from "@/features/activity/activity"

export const Route = createFileRoute("/_app/activity")({
  validateSearch: activitySearch,
  component: Activity,
})
