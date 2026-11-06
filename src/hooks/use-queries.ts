import * as cached from "convex-helpers/react/cache/hooks"
import { useRef } from "react"

import { useAway } from "@/hooks/use-away"

// The cached query hooks, skipped while the user is away. Each keeps showing what it had, so a page
// doesn't fall back to loading and lose what's open on it.

export const useQuery = ((query, ...args) => {
  const away = useAway()
  const last = useRef<ReturnType<typeof cached.useQuery>>(undefined)
  const result = cached.useQuery(query, ...((away ? ["skip"] : args) as typeof args))
  if (!away) last.current = result
  return away ? last.current : result
}) as typeof cached.useQuery

export const useQueries: typeof cached.useQueries = (queries) => {
  const away = useAway()
  const last = useRef<ReturnType<typeof cached.useQueries>>({})
  const result = cached.useQueries(away ? {} : queries)
  if (!away) last.current = result
  return away ? last.current : result
}

// Coming back starts the list again from its first page, so pages loaded with loadMore are lost.
export const usePaginatedQuery = ((query, args, options) => {
  const away = useAway()
  const last = useRef<ReturnType<typeof cached.usePaginatedQuery>>(undefined)
  const result = cached.usePaginatedQuery(query, away ? "skip" : args, options)
  if (!away) last.current = result
  return away && last.current ? last.current : result
}) as typeof cached.usePaginatedQuery
