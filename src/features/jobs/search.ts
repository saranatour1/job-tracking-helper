import { type Proof, proofs } from "@convex/features/jobs/domains"

export const postedWithin = { day: 1, week: 7, month: 30 } as const
export type Posted = keyof typeof postedWithin

export type JobsSearch = {
  q?: string
  remote?: boolean
  // Roles one after another, instead of under their domains.
  view?: "roles"
  collapsed?: boolean
  posted?: Posted
  // A board id; the server finds nothing for one that isn't.
  board?: string
  fits?: boolean
  proof?: Proof
  // A domain ending, like ".ai"; the server finds nothing for one that isn't.
  ending?: string
}

// Reads the page's filters from the address, dropping anything it doesn't know.
export const jobsSearch = (search: Record<string, unknown>): JobsSearch => ({
  q: typeof search.q === "string" && search.q.trim() ? search.q.slice(0, 200) : undefined,
  remote: search.remote === true ? true : undefined,
  view: search.view === "roles" ? "roles" : undefined,
  collapsed: search.collapsed === true ? true : undefined,
  posted:
    typeof search.posted === "string" && search.posted in postedWithin
      ? (search.posted as Posted)
      : undefined,
  board: typeof search.board === "string" && search.board ? search.board : undefined,
  fits: search.fits === true ? true : undefined,
  proof: proofs.includes(search.proof as Proof) ? (search.proof as Proof) : undefined,
  ending:
    typeof search.ending === "string" && /^\.[a-z0-9-]{1,63}$/.test(search.ending)
      ? search.ending
      : undefined,
})
