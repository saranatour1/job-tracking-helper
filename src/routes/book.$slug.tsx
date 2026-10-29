import { createFileRoute } from "@tanstack/react-router"

import { BookingPage, bookingSearch } from "@/features/booking/booking-page"

// Public: anyone with a booking link can open it, signed in or not.
const Page = () => <BookingPage slug={Route.useParams().slug} />

export const Route = createFileRoute("/book/$slug")({
  validateSearch: bookingSearch,
  component: Page,
})
