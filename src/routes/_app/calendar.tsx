import { createFileRoute } from "@tanstack/react-router"

import { CalendarPage, calendarSearch } from "@/features/calendar/calendar"
import { ConvexSource } from "@/features/tracker/source"

const Page = () => (
  <ConvexSource>
    <CalendarPage />
  </ConvexSource>
)

export const Route = createFileRoute("/_app/calendar")({
  component: Page,
  validateSearch: calendarSearch,
})
