import { defineTable } from "convex/server"
import { arkOutputToConvex } from "../../lib/ark"
import { BookingPage } from "./validators"

export const bookingPagesTable = defineTable(arkOutputToConvex(BookingPage))
  .index("by_userId", ["userId"])
  .index("by_slug", ["slug"])
