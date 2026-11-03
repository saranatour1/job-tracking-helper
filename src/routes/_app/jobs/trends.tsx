import { createFileRoute } from "@tanstack/react-router"

import { trendsSearch } from "@/features/jobs/search"
import { Trends } from "@/features/jobs/trends"
import { publicHead, site } from "@/lib/seo"

export const Route = createFileRoute("/_app/jobs/trends")({
  component: Trends,
  validateSearch: trendsSearch,
  head: () =>
    publicHead({
      title: `Job trends | ${site.name}`,
      description:
        "New roles posted each week by country, location and job title, from company job boards.",
      path: "/jobs/trends",
    }),
})
