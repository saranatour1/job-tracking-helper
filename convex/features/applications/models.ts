import { defineTable } from "convex/server"
import { arkId, arkOutputToConvex } from "../../lib/ark"
import { Application, Event, Note } from "./validators"

export const applicationsTable = defineTable(
  arkOutputToConvex(
    Application.and({
      userId: arkId("users"),
      // Every status change, oldest first, capped at limits.history. Optional for
      // applications from before history was kept.
      "history?": Event.array(),
      "notes?": Note.array(),
      // The goal it counts toward, if any.
      "goalId?": arkId("goals"),
      // Numbered 1, 2, 3… per person, shown as APP-1. Set by the server.
      "number?": "number",
      // Off the board but kept; after 30 days it moves to the Trash.
      "archivedAt?": "number",
      // In the Trash, out of everything else.
      "trashedAt?": "number",
      // When the Trash deletes it for good, from the owner's `trashDays`; unset keeps it.
      "purgeAt?": "number",
    })
  )
)
  // Oldest first for the board; the next one finds a goal's applications.
  // eslint-disable-next-line @convex-dev/no-duplicate-indexes
  .index("by_userId", ["userId"])
  .index("by_userId_and_goalId", ["userId", "goalId"])
  .index("by_archivedAt", ["archivedAt"])
  .index("by_purgeAt", ["purgeAt"])
