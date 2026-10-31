import { type } from "arktype"
import { defineTable } from "convex/server"
import { arkId, arkOutputToConvex } from "../../lib/ark"
import { kinds } from "../email/match"
import { Application, Event, Note } from "./validators"

const Stored = Application.and({
  userId: arkId("users"),
  // Every status change, oldest first, capped at limits.history.
  history: Event.array(),
  "notes?": Note.array(),
  // The goal it counts toward, if any.
  "goalId?": arkId("goals"),
  // Numbered 1, 2, 3… per person, shown as APP-1. Set by the server.
  number: "number",
  // Off the board but kept; after 30 days it moves to the Trash.
  "archivedAt?": "number",
  // In the Trash, out of everything else.
  "trashedAt?": "number",
  // When the Trash deletes it for good, from the owner's `trashDays`; unset keeps it.
  "purgeAt?": "number",
  // Jev's fit from the job it came from, so the board needn't read job leads.
  "fit?": "number",
  "isFit?": "boolean",
  // How much mail is filed under it and the newest, so the board needn't read or open
  // any. `syncMailSummary` keeps it right.
  "mail?": type({ count: "number", at: "number", kind: type.enumerated(...kinds) }),
})

// A row on the board: all of it but the two fields that can be long.
export const vCard = arkOutputToConvex(
  Stored.omit("description", "notes").and({
    _id: arkId("applications"),
    _creationTime: "number",
    // When the last note was written, for the card's Active or Quiet.
    "lastNoteAt?": "number",
  })
)

export const applicationsTable = defineTable(arkOutputToConvex(Stored))
  // Oldest first for the board; the next one finds a goal's applications.
  // eslint-disable-next-line @convex-dev/no-duplicate-indexes
  .index("by_userId", ["userId"])
  .index("by_userId_and_goalId", ["userId", "goalId"])
  // `trashedAt: undefined` is everything not in the Trash, newest last.
  .index("by_userId_and_trashedAt", ["userId", "trashedAt"])
  // APP-12 in a link.
  .index("by_userId_and_number", ["userId", "number"])
  .index("by_archivedAt", ["archivedAt"])
  .index("by_purgeAt", ["purgeAt"])
