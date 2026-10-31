import { defineTable } from "convex/server"
import { arkOutputToConvex } from "../../lib/ark"
import { CalendarEvent, CalendarSettingsRow } from "./validators"

export const calendarEventsTable = defineTable(arkOutputToConvex(CalendarEvent))
  .index("by_userId_and_key", ["userId", "key"])
  .index("by_userId_and_applicationId", ["userId", "applicationId"])
  .index("by_userId_and_end", ["userId", "end"])
  .index("by_userId_and_replaces", ["userId", "replaces"])
  .index("by_userId_and_rrule", ["userId", "rrule"])

export const calendarSettingsTable = defineTable(arkOutputToConvex(CalendarSettingsRow)).index(
  "by_userId",
  ["userId"]
)
