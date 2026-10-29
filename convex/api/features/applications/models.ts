import { defineTable } from "convex/server"
import { arkId, arkOutputToConvex } from "../../../lib/ark"
import { Application, Event, Note } from "./validators"

export const applicationsTable = defineTable(
  arkOutputToConvex(
    Application.and({
      userId: arkId("users"),
      // Every status change, oldest first, capped at limits.history. Optional for
      // applications from before history was kept.
      "history?": Event.array(),
      "notes?": Note.array(),
      // Numbered 1, 2, 3… per person, shown as APP-1. Set by the server.
      "number?": "number",
      // Off the board but kept; after 30 days it moves to the Trash.
      "archivedAt?": "number",
      // In the Trash, out of everything else; deleted for good after the person's
      // `trashDays`.
      "trashedAt?": "number",
    })
  )
)
  .index("by_userId", ["userId"])
  .index("by_archivedAt", ["archivedAt"])
  .index("by_trashedAt", ["trashedAt"])
