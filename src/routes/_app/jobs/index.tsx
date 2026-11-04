import { createFileRoute } from "@tanstack/react-router"
import { rowLimits } from "@convex/features/preferences/rows"

import { Jobs } from "@/features/jobs/jobs"
import { jobsSearch, readsOf, sinceOnTheHour } from "@/features/jobs/search"
import { api } from "@/lib/api"
import { httpClient } from "@/lib/convex"
import { publicHead, site } from "@/lib/seo"

const pageSize = 25

export const Route = createFileRoute("/_app/jobs/")({
  component: Jobs,
  validateSearch: jobsSearch,
  loaderDeps: ({ search }) => readsOf(search),
  staleTime: Number.POSITIVE_INFINITY,
  loader: async ({ deps: { q, remote, board, posted, fits, proof, ending, pages = 1 } }) => {
    const { http, signedIn } = await httpClient()
    const me = signedIn ? http.query(api.users.me, {}) : Promise.resolve(null)
    const member = me.then((m) => Boolean(m && !m.anonymous))
    const args = {
      q,
      remoteOnly: remote,
      boardId: board,
      since: sinceOnTheHour(posted),
      fits,
      proof,
      ending,
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
    const ifMember = <T,>(load: () => Promise<T>) => member.then((yes) => (yes ? load() : null))
    const [who, found, stats, companies, prepared, tags] = await Promise.all([
      me,
      jobs(),
      http.query(api.jobs.stats, {}),
      ifMember(() => http.query(api.jobs.companies, {})),
      ifMember(() => http.query(api.prefilled.list, {})),
      ifMember(() =>
        http.query(api.preferences.tags, {
          paginationOpts: { numItems: rowLimits.tags, cursor: null },
        })
      ),
    ])
    return {
      allowedSearch: who?.allowedSearch ?? null,
      jobs: found,
      stats,
      companies: companies ?? [],
      prepared: prepared ?? [],
      tags: tags?.page ?? [],
    }
  },
  head: () =>
    publicHead({
      title: `Open roles | ${site.name}`,
      description:
        "Search open roles from company job boards on Greenhouse, Lever, Ashby, Personio and more, refreshed daily.",
      path: "/jobs",
    }),
})
