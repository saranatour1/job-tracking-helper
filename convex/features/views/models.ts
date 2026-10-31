import { defineTable } from "convex/server"
import { arkOutputToConvex } from "../../lib/ark"
import { View } from "./validators"

export const viewsTable = defineTable(arkOutputToConvex(View)).index("by_userId", ["userId"])
