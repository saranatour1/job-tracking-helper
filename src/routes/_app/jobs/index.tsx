import { createFileRoute } from "@tanstack/react-router"

import { Jobs } from "@/features/jobs/jobs"
import { jobsSearch, sinceOnTheHour } from "@/features/jobs/search"
import { api } from "@/lib/api"
import { httpClient } from "@/lib/convex"
import { publicHead, site } from "@/lib/seo"

const pageSize = 25

export const Route = createFileRoute("/_app/jobs/")({
  component: Jobs,
  validateSearch: jobsSearch,
  loaderDeps: ({ search }) => search,
  staleTime: Number.POSITIVE_INFINITY,
  loader: async ({ deps: { q, remote, board, posted, fits, pages = 1 } }) => {
    const { http, signedIn } = await httpClient()
    const me = signedIn ? http.query(api.users.me, {}) : Promise.resolve(null)
    const member = me.then((m) => Boolean(m && !m.anonymous))
    const args = {
      q,
      remoteOnly: remote,
      boardId: board,
      since: sinceOnTheHour(posted),
      fits,
    }
    const read = (cursor: string | null) =>
      http.query(api.jobs.search, { ...args, paginationOpts: { numItems: pageSize, cursor } })
    const jobs = async () => {
      let found = await read(null)
      for (let i = 1; i < pages && !found.isDone; i++) {
        const next = await read(found.continueCursor)
        found = { ...next, page: [...found.page, ...next.page] }
      }
      return { page: found.page, isDone: found.isDone }
    }
    const [who, found, stats, companies, prepared] = await Promise.all([
      me,
      jobs(),
      http.query(api.jobs.stats, {}),
      http.query(api.jobs.companies, {}),
      member.then((yes) => (yes ? http.query(api.prefilled.list, {}) : [])),
    ])
    return { allowedSearch: who?.allowedSearch ?? null, jobs: found, stats, companies, prepared }
  },
  head: () =>
    publicHead({
      title: `Open roles | ${site.name}`,
      description:
        "Search open roles from company job boards on Greenhouse, Lever, Ashby, Personio and more, refreshed daily.",
      path: "/jobs",
    }),
})
