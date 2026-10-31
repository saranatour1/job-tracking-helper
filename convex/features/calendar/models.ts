import { defineTable } from "convex/server"
import { arkOutputToConvex } from "../../lib/ark"
import { CalendarEvent, CalendarSettingsRow } from "./validators"

export const calendarEventsTable = defineTable(arkOutputToConvex(CalendarEvent))
  .index("by_userId_and_key", ["userId", "key"])
  // An application's events, to unlink them when it's deleted.
  .index("by_userId_and_applicationId", ["userId", "applicationId"])
  // What a date range needs: what ends after it starts, fixes and repeating events.
  .index("by_userId_and_end", ["userId", "end"])
  .index("by_userId_and_replaces", ["userId", "replaces"])
  .index("by_userId_and_rrule", ["userId", "rrule"])

export const calendarSettingsTable = defineTable(arkOutputToConvex(CalendarSettingsRow)).index(
  "by_userId",
  ["userId"]
)
