import { createFileRoute } from "@tanstack/react-router"

import { BookingPage } from "@/features/booking/booking-page"
import { bookingSearch } from "@/features/booking/search"

// Public: anyone with a booking link can open it, signed in or not.
const Page = () => <BookingPage slug={Route.useParams().slug} />

export const Route = createFileRoute("/book/$slug")({
  validateSearch: bookingSearch,
  component: Page,
})
