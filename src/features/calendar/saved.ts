import { api } from "@convex/_generated/api"
import type { Doc, Id } from "@convex/_generated/dataModel"
import { useMutation } from "convex/react"
import { useQuery } from "convex-helpers/react/cache/hooks"

// Your events and calendar settings in Convex. Each change shows at once (an optimistic
// update), so a dragged event stays where you dropped it while it saves.

export const useSavedEvents = () => useQuery(api.calendar.list)

export const useSaveEvent = () =>
  useMutation(api.calendar.save).withOptimisticUpdate((store, args) => {
    const rows = store.getQuery(api.calendar.list, {})
    if (!rows) return
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
      {},
      old ? rows.map((r) => (r.key === args.key ? row : r)) : [...rows, row]
    )
  })

export const useRemoveEvent = () =>
  useMutation(api.calendar.remove).withOptimisticUpdate((store, { key }) => {
    const rows = store.getQuery(api.calendar.list, {})
    if (!rows) return
    store.setQuery(
      api.calendar.list,
      {},
      rows.flatMap((r) => (r.key !== key ? [r] : r.replaces ? [{ ...r, hidden: true }] : []))
    )
  })

export const useCalendarSettings = () => useQuery(api.calendar.settings)

export const useSaveCalendarSettings = () =>
  useMutation(api.calendar.saveSettings).withOptimisticUpdate((store, settings) =>
    store.setQuery(api.calendar.settings, {}, settings)
  )
