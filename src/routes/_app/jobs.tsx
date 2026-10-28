import { createFileRoute } from "@tanstack/react-router"

import { Jobs, jobsSearch } from "@/features/jobs/jobs"

export const Route = createFileRoute("/_app/jobs")({
  component: Jobs,
  validateSearch: jobsSearch,
})
