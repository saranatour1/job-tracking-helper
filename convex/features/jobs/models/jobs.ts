import { defineTable } from "convex/server"
import { arkOutputToConvex } from "../../../lib/ark"
import { Job } from "../validators"

export const jobsTable = defineTable(arkOutputToConvex(Job))
  .index("by_urlKey", ["urlKey"])
  .index("by_boardId_and_postedAt", ["boardId", "postedAt"])
  .index("by_postedAt", ["postedAt"])
  .index("by_remote_and_postedAt", ["remote", "postedAt"])
  .searchIndex("search_text", { searchField: "text", filterFields: ["remote", "boardId"] })
