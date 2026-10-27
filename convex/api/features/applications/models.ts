import { defineTable } from "convex/server"
import { arkId, arkOutputToConvex } from "../../../lib/ark"
import { Application } from "./validators"

export const applicationsTable = defineTable(
  arkOutputToConvex(Application.and({ userId: arkId("users") }))
).index("by_userId", ["userId"])
