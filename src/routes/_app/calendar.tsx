import { createFileRoute } from "@tanstack/react-router"

import { CalendarPage } from "@/features/calendar/calendar"
import { calendarSearch } from "@/features/calendar/search"
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
