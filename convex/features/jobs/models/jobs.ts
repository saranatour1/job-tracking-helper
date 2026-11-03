import { defineTable } from "convex/server"
import { v } from "convex/values"
import { arkOutputToConvex } from "../../../lib/ark"
import { Job, vDimension } from "../validators"

export const jobsTable = defineTable(arkOutputToConvex(Job))
  .index("by_urlKey", ["urlKey"])
  .index("by_boardId_and_postedAt", ["boardId", "postedAt"])
  .index("by_postedAt", ["postedAt"])
  .index("by_remote_and_postedAt", ["remote", "postedAt"])
  .searchIndex("search_text", { searchField: "text", filterFields: ["remote", "boardId"] })

// Roles first seen per country, place or title, per week posted. Closed roles stay counted.
export const jobTrendsTable = defineTable({
  dimension: vDimension,
  key: v.string(),
  label: v.string(),
  week: v.number(),
  roles: v.number(),
})
  .index("by_dimension_and_key_and_week", ["dimension", "key", "week"])
  .index("by_dimension_and_week_and_roles", ["dimension", "week", "roles"])
