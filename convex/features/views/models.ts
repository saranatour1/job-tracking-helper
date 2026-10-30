import { defineTable } from "convex/server"
import { arkOutputToConvex } from "../../lib/ark"
import { View } from "./validators"

// A saved set of filters and a layout, one row per view, owned by one person.
export const viewsTable = defineTable(arkOutputToConvex(View)).index("by_userId", ["userId"])
