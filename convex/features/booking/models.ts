import { defineTable } from "convex/server"
import { arkOutputToConvex } from "../../lib/ark"
import { BookingPage } from "./validators"

// A public link anyone can book time on. `slug` is random, so pages can't be guessed.
export const bookingPagesTable = defineTable(arkOutputToConvex(BookingPage))
  .index("by_userId", ["userId"])
  .index("by_slug", ["slug"])
