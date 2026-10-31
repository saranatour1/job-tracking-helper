import { api } from "@/lib/api"
import { useMutation } from "convex/react"
import { useQuery } from "convex-helpers/react/cache/hooks"

import type { Filters, View } from "./data"
import type { Display } from "./display-options"

/** The person's saved views, in the shape the tracker draws. */
export const useSavedViews = (): View[] =>
  (useQuery(api.views.list) ?? []).map((v) => ({
    id: v._id,
    name: v.name,
    description: v.description,
    filters: v.filters as Filters,
    display: v.display as Partial<Display> | undefined,
  }))

export const useCreateView = () => useMutation(api.views.create)
export const useRemoveView = () => useMutation(api.views.remove)
