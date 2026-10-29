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
    })
  )
).index("by_userId", ["userId"])
