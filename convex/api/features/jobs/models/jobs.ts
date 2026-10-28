import { defineTable } from "convex/server"
import { type } from "arktype"
import { arkId, arkOutputToConvex } from "../../../../lib/ark"

// One open role in the shared catalog, from a board's feed. Everyone searches the same
// rows; `seenAt` is the last fetch that listed it, so roles a board drops get removed.
export const Job = type({
  boardId: arkId("jobBoards"),
  urlKey: "string",
  url: "string",
  title: "string",
  company: "string",
  location: "string",
  remote: "boolean",
  postedAt: "number",
  seenAt: "number",
  text: "string",
})

export const jobsTable = defineTable(arkOutputToConvex(Job))
  .index("by_urlKey", ["urlKey"])
  .index("by_boardId_and_seenAt", ["boardId", "seenAt"])
  .index("by_postedAt", ["postedAt"])
  .index("by_remote_and_postedAt", ["remote", "postedAt"])
  .searchIndex("search_text", { searchField: "text", filterFields: ["remote"] })
