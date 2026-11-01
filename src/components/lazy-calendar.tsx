import { lazy, Suspense } from "react"

import type { Calendar } from "@/components/ui/calendar"

// Left out of the Worker and the page's first download: it only draws in an open popover.
const LoadedCalendar = lazy(() =>
  import.meta.env.SSR
    ? Promise.reject(new Error("The calendar draws in the browser"))
    : import("@/components/ui/calendar").then((module) => ({ default: module.Calendar }))
)

export const LazyCalendar = (props: React.ComponentProps<typeof Calendar>) => (
  <Suspense fallback={<div className="size-64" />}>
    <LoadedCalendar {...props} />
  </Suspense>
)
