export type BookingSearch = { at?: number; booked?: number }
export const bookingSearch = (search: Record<string, unknown>): BookingSearch => ({
  at: Number.isInteger(search.at) ? Number(search.at) : undefined,
  booked: Number.isInteger(search.booked) ? Number(search.booked) : undefined,
})
