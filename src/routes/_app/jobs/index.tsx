import { createFileRoute } from "@tanstack/react-router"

import { Jobs, jobsSearch } from "@/features/jobs/jobs"
import { publicHead, site } from "@/lib/seo"

export const Route = createFileRoute("/_app/jobs/")({
  component: Jobs,
  validateSearch: jobsSearch,
  head: () =>
    publicHead({
      title: `Open roles | ${site.name}`,
      description:
        "Search open roles from company job boards on Greenhouse, Lever, Ashby, Personio and more, refreshed daily.",
      path: "/jobs",
    }),
})
