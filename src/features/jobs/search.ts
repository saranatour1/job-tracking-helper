import { type Dimension, dimensions } from "@convex/features/jobs/dimensions"
import type { AnyRouter } from "@tanstack/react-router"

export const trendsSearch = (search: Record<string, unknown>): { by?: Dimension } => ({
  by: dimensions.includes(search.by as Dimension) ? (search.by as Dimension) : undefined,
})

export const postedWithin = { day: 1, week: 7, month: 30 } as const
export type Posted = keyof typeof postedWithin

export type JobsSearch = {
  q?: string
  remote?: boolean
  posted?: Posted
  // A board id; the server finds nothing for one that isn't.
  board?: string
  fits?: boolean
  pages?: number
}

export const maxPages = 20

const hour = 60 * 60 * 1000

export const sinceOnTheHour = (posted: Posted | undefined) =>
  posted ? Math.floor(Date.now() / hour) * hour - postedWithin[posted] * 24 * hour : undefined

// Reads the page's filters from the address, dropping anything it doesn't know.
export const jobsSearch = (search: Record<string, unknown>): JobsSearch => ({
  q: typeof search.q === "string" && search.q.trim() ? search.q.slice(0, 200) : undefined,
  remote: search.remote === true ? true : undefined,
  posted:
    typeof search.posted === "string" && search.posted in postedWithin
      ? (search.posted as Posted)
      : undefined,
  board: typeof search.board === "string" && search.board ? search.board : undefined,
  fits: search.fits === true ? true : undefined,
  pages:
    typeof search.pages === "number" && Number.isInteger(search.pages) && search.pages > 1
      ? Math.min(search.pages, maxPages)
      : undefined,
})

export const refreshJobs = (router: AnyRouter, q?: string) =>
  router.invalidate({
    filter: (m) =>
      m.routeId === "/_app/jobs/" && (q === undefined || (m.search as JobsSearch).q === q),
  })
