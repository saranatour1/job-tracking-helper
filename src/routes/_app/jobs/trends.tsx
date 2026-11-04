import { createFileRoute } from "@tanstack/react-router"
import { weekOf } from "@convex/features/jobs/dimensions"

import { trendsSearch } from "@/features/jobs/search"
import { Trends } from "@/features/jobs/trends"
import { api } from "@/lib/api"
import { httpClient } from "@/lib/convex"
import { publicHead, site } from "@/lib/seo"

// The counts move once an hour, so a read is good for ten minutes.
const fresh = 10 * 60 * 1000

export const Route = createFileRoute("/_app/jobs/trends")({
  component: Trends,
  validateSearch: trendsSearch,
  loaderDeps: ({ search: { by } }) => ({ by }),
  staleTime: fresh,
  loader: async ({ deps: { by = "country" } }) => {
    const { http } = await httpClient()
    const week = weekOf(Date.now())
    const [rows, stats] = await Promise.all([
      http.query(api.jobs.trends, { dimension: by, week }),
      http.query(api.jobs.stats, {}),
    ])
    return { week, rows, stats }
  },
  head: ({ match: { search } }) => {
    const path = search.by ? `/jobs/trends?by=${search.by}` : "/jobs/trends"
    const head = publicHead({
      title: `Job trends | ${site.name}`,
      description:
        "New roles posted each week by country, location and job title, from company job boards.",
      path,
    })
    return {
      ...head,
      links: [
        ...head.links,
        { rel: "alternate", type: "text/markdown", href: `${site.url}/jobs/trends/llms.txt` },
      ],
    }
  },
})
