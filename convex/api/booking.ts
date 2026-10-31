// Registers `api.api.booking.*`. Definitions live in ../features/booking.
import { bookingApi } from "../features/booking/public"

export const { pages, savePage, removePage, page, book } = bookingApi
