import { defineTable } from "convex/server"
import { arkOutputToConvex } from "../../lib/ark"
import { CalendarEvent, CalendarSettingsRow } from "./validators"

export const calendarEventsTable = defineTable(arkOutputToConvex(CalendarEvent))
  .index("by_userId_and_key", ["userId", "key"])
  // An application's events, to unlink them when it's deleted.
  .index("by_userId_and_applicationId", ["userId", "applicationId"])

export const calendarSettingsTable = defineTable(arkOutputToConvex(CalendarSettingsRow)).index(
  "by_userId",
  ["userId"]
)
