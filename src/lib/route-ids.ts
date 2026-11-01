import type { Id } from "@convex/_generated/dataModel"
import { useQuery } from "convex-helpers/react/cache/hooks"
import { useMemo, useRef } from "react"

import { api } from "@/lib/api"

/** Regular text for a route, instead of a table id: "Engineer · Figma" is "engineer-figma". */
export const routeText = (text: string) =>
  text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 80)
    .replace(/^-+|-+$/g, "") || "item"

/** For what has no name, or a private one, like an email: "Oct 31, 3:10 PM" is "oct-31-3-10-pm". */
export const dateText = (at: number) =>
  routeText(
    new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(at)
  )

/** A posting's route: the catalog is too big to load for `routeIds`, so its id stays on the end.
 * "engineer-figma-k57abc". Ids have no dashes, and the words can change without breaking a link. */
export const postingText = (job: { _id: string; title: string; company: string }) =>
  `${routeText(`${job.title} ${job.company}`)}-${job._id}`

export const postingId = (text: string) => text.slice(text.lastIndexOf("-") + 1)

/** Turns rows' ids into text and back. A repeat gets a number; a real id still finds its row,
 * so old links work, and a row that isn't loaded keeps its id. */
export const routeIds = <T, I extends string>(
  rows: readonly T[],
  idOf: (row: T) => I,
  textOf: (row: T) => string
) => {
  const textById = new Map<string, string>()
  const idByText = new Map<string, I>()
  // In id order, so who gets a repeat's number doesn't depend on how the list is sorted.
  for (const row of [...rows].sort((a, b) => (idOf(a) < idOf(b) ? -1 : 1))) {
    const base = routeText(textOf(row))
    let text = base
    for (let n = 2; idByText.has(text); n++) text = `${base}-${n}`
    textById.set(idOf(row), text)
    idByText.set(text, idOf(row))
  }
  return {
    text: (id: I) => textById.get(id) ?? id,
    id: (text: string): I | undefined =>
      idByText.get(text) ?? (textById.has(text) ? (text as I) : undefined),
  }
}

type Routes<I extends string> = ReturnType<typeof routeIds<unknown, I>>

/** The id for text in the URL. Keeps it if the row is renamed or moves list while you're there. */
export const useRouteId = <I extends string>(routes: Routes<I>, text: string | undefined) => {
  const last = useRef<{ text: string; id: I }>(undefined)
  const id = text ? routes.id(text) : undefined
  if (text && id) last.current = { text, id }
  return id ?? (last.current?.text === text ? last.current?.id : undefined)
}

/** `routeIds` for a query's rows, with whether they've loaded. */
export const useRoutes = <T, I extends string>(
  rows: readonly T[] | undefined,
  idOf: (row: T) => I,
  textOf: (row: T) => string
) => {
  const routes = useMemo(() => routeIds(rows ?? [], idOf, textOf), [rows])
  return { ...routes, loaded: rows !== undefined }
}

/** An application's text is its short code, which editing it doesn't change. */
export const applicationText = (a: { id: string; code?: string | undefined }) =>
  // Sample ids are their code already.
  a.code && a.code !== a.id ? routeText(a.code) : a.id

/** The text for an application known only by its id. Until its number loads that's the id,
 * which a route takes too. */
export const useApplicationText = (id: string | undefined) => {
  const number = useQuery(api.applications.numberOf, id ? { id: id as Id<"applications"> } : "skip")
  return number ? `app-${number}` : id
}

export const useGoalRoutes = () =>
  useRoutes<{ _id: string; name: string }, string>(
    useQuery(api.goals.list),
    (g) => g._id,
    (g) => g.name
  )

export const useViewRoutes = () =>
  useRoutes<{ _id: string; name: string }, string>(
    useQuery(api.views.list),
    (v) => v._id,
    (v) => v.name
  )

export const useWorkflowRoutes = () =>
  useRoutes(
    useQuery(api.automations.list),
    (w) => w._id,
    (w) => w.name
  )

export const usePrefillRoutes = () =>
  useRoutes(
    useQuery(api.prefilled.list),
    (p) => p._id,
    (p) => `${p.title} ${p.company}`
  )

export const useLoopRoutes = () =>
  useRoutes(
    useQuery(api.loops.list),
    (l) => l._id,
    (l) => l.name
  )
