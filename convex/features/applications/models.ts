import { type } from "arktype"
import { defineTable } from "convex/server"
import { arkId, arkOutputToConvex } from "../../lib/ark"
import { kinds } from "../email/match"
import { Application, Event, Note } from "./validators"

const Stored = Application.and({
  userId: arkId("users"),
  history: Event.array(),
  "notes?": Note.array(),
  "goalId?": arkId("goals"),
  number: "number",
  "archivedAt?": "number",
  "trashedAt?": "number",
  "purgeAt?": "number",
  "fit?": "number",
  "isFit?": "boolean",
  // Kept right by `syncMailSummary`.
  "mail?": type({ count: "number", at: "number", kind: type.enumerated(...kinds) }),
})

export const vCard = arkOutputToConvex(
  Stored.omit("description", "notes").and({
    _id: arkId("applications"),
    _creationTime: "number",
    "lastNoteAt?": "number",
  })
)

export const applicationsTable = defineTable(arkOutputToConvex(Stored))
  // Oldest first for the board; the next one finds a goal's applications.
  // eslint-disable-next-line @convex-dev/no-duplicate-indexes
  .index("by_userId", ["userId"])
  .index("by_userId_and_goalId", ["userId", "goalId"])
  .index("by_userId_and_trashedAt", ["userId", "trashedAt"])
  .index("by_userId_and_number", ["userId", "number"])
  .index("by_archivedAt", ["archivedAt"])
  .index("by_purgeAt", ["purgeAt"])

// One row per sent application, for streaks. It outlives the application, so the Trash
// emptying can't shorten someone's streak.
export const applicationSendsTable = defineTable(
  arkOutputToConvex(
    type({ userId: arkId("users"), applicationId: arkId("applications"), at: "number" })
  )
)
  .index("by_userId_and_at", ["userId", "at"])
  .index("by_applicationId", ["applicationId"])
