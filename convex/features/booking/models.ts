import { defineTable } from "convex/server"
import { v } from "convex/values"

// What a booking page offers, set by its host. Hours are in the host's zone.
export const vPageFields = {
  title: v.string(),
  minutes: v.number(),
  startHour: v.number(),
  endHour: v.number(),
  days: v.array(v.number()),
  noticeHours: v.number(),
  horizonDays: v.number(),
  timeZone: v.string(),
  // Bookings go under this application; without one, by the guest's email domain.
  applicationId: v.optional(v.id("applications")),
  // Where the call happens: a room, "Phone", or a video link.
  location: v.optional(v.string()),
  active: v.boolean(),
}

// A public link anyone can book time on. `slug` is random, so pages can't be guessed.
export const bookingPagesTable = defineTable({
  userId: v.id("users"),
  slug: v.string(),
  ...vPageFields,
})
  .index("by_userId", ["userId"])
  .index("by_slug", ["slug"])
