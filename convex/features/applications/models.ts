import { defineTable } from "convex/server"
import { arkId, arkOutputToConvex } from "../../lib/ark"
import { Application, Event, Note } from "./validators"

export const applicationsTable = defineTable(
  arkOutputToConvex(
    Application.and({
      userId: arkId("users"),
      history: Event.array(),
      "notes?": Note.array(),
      "goalId?": arkId("goals"),
      number: "number",
      "archivedAt?": "number",
      "trashedAt?": "number",
      "purgeAt?": "number",
    })
  )
)
  // Oldest first for the board; the next one finds a goal's applications.
  // eslint-disable-next-line @convex-dev/no-duplicate-indexes
  .index("by_userId", ["userId"])
  .index("by_userId_and_goalId", ["userId", "goalId"])
  .index("by_userId_and_trashedAt", ["userId", "trashedAt"])
  .index("by_archivedAt", ["archivedAt"])
  .index("by_purgeAt", ["purgeAt"])
