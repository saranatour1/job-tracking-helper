import { defineTable } from "convex/server"
import { type } from "arktype"
import { arkOutputToConvex } from "../../../lib/ark"
import { boardKinds } from "../boards"

// A company's job board. The hourly refresh fetches each one about once a day;
// `fetchedAt` is unset until the first fetch, so new boards go first.
export const JobBoard = type({
  kind: type.enumerated(...boardKinds),
  slug: "string",
  company: "string",
  addedAt: "number",
  "fetchedAt?": "number",
  jobs: "number",
  "error?": "string",
})

export const jobBoardsTable = defineTable(arkOutputToConvex(JobBoard))
  .index("by_kind_and_slug", ["kind", "slug"])
  .index("by_fetchedAt", ["fetchedAt"])
