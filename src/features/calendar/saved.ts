import { api } from "@/lib/api"
import type { Doc, Id } from "@convex/_generated/dataModel"
import { useMutation } from "convex/react"
import { useQuery } from "convex-helpers/react/cache/hooks"
import { useRef } from "react"

// Your events and calendar settings in Convex. Each change shows at once (an optimistic
// update), so a dragged event stays where you dropped it while it saves.

/** Your events that can show between two days, or all of them without. */
export const useSavedEvents = (range?: { from: string; to: string }) =>
  useQuery(api.calendar.list, range ?? {})

/** The last value that came, so moving to another range doesn't blink empty. */
export const useLast = <T>(value: T | undefined) => {
  const last = useRef(value)
  if (value !== undefined) last.current = value
  return last.current
}

export const useSaveEvent = () =>
  useMutation(api.calendar.save).withOptimisticUpdate((store, args) => {
    // Every range on hand: a moved event can leave one and enter another.
    for (const { args: range, value: rows } of store.getAllQueries(api.calendar.list)) {
      if (!rows) continue
      const old = rows.find((r) => r.key === args.key)
      const row: Doc<"calendarEvents"> = {
        _id: old?._id ?? (`optimistic:${args.key}` as Id<"calendarEvents">),
        _creationTime: old?._creationTime ?? Date.now(),
        userId: old?.userId ?? ("" as Id<"users">),
        ...args,
        kind: args.kind ?? old?.kind ?? "reminder",
      }
      store.setQuery(
        api.calendar.list,
        range,
        old ? rows.map((r) => (r.key === args.key ? row : r)) : [...rows, row]
      )
    }
  })

export const useRemoveEvent = () =>
  useMutation(api.calendar.remove).withOptimisticUpdate((store, { key }) => {
    for (const { args: range, value: rows } of store.getAllQueries(api.calendar.list))
      if (rows)
        store.setQuery(
          api.calendar.list,
          range,
          rows.flatMap((r) => (r.key !== key ? [r] : r.replaces ? [{ ...r, hidden: true }] : []))
        )
  })

export const useCalendarSettings = () => useQuery(api.calendar.settings)

export const useSaveCalendarSettings = () =>
  useMutation(api.calendar.saveSettings).withOptimisticUpdate((store, settings) =>
    store.setQuery(api.calendar.settings, {}, settings)
  )
