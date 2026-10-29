// Registers `api.booking.*`. Definitions live in ./api/features/booking.
import { bookingApi } from "./api/features/booking/public"

export const { pages, savePage, removePage, page, book } = bookingApi
