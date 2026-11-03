import { createFileRoute } from "@tanstack/react-router"
import { ConvexHttpClient } from "convex/browser"

import { Jobs } from "@/features/jobs/jobs"
import { jobsSearch } from "@/features/jobs/search"
import { api } from "@/lib/api"
import { publicHead, site } from "@/lib/seo"

export const Route = createFileRoute("/_app/jobs/")({
  component: Jobs,
  validateSearch: jobsSearch,
  // The newest roles, in the server's HTML only, so crawlers have links to role pages. The
  // list shows them until its own query loads. A visit from inside the app goes straight to that.
  loader: async () =>
    import.meta.env.SSR
      ? (
          await new ConvexHttpClient(String(import.meta.env.VITE_CONVEX_URL)).query(
            api.jobs.search,
            { paginationOpts: { numItems: 25, cursor: null } }
          )
        ).page
      : [],
  head: () =>
    publicHead({
      title: `Open roles | ${site.name}`,
      description:
        "Search open roles from company job boards on Greenhouse, Lever, Ashby, Personio and more, refreshed daily.",
      path: "/jobs",
    }),
})
