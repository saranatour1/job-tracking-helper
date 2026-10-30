import { defineTable } from "convex/server"
import { v } from "convex/values"

// What a saved view shows: filters by field, and the display options it changes.
export const vViewFields = {
  name: v.string(),
  description: v.string(),
  filters: v.record(v.string(), v.array(v.string())),
  display: v.optional(
    v.object({
      layout: v.optional(v.union(v.literal("board"), v.literal("list"))),
      groupBy: v.optional(v.string()),
      orderBy: v.optional(v.string()),
      showEmpty: v.optional(v.boolean()),
      shown: v.optional(v.array(v.string())),
    })
  ),
}

// A saved set of filters and a layout, one row per view, owned by one person.
export const viewsTable = defineTable({ userId: v.id("users"), ...vViewFields }).index(
  "by_userId",
  ["userId"]
)
