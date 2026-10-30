import { v } from "convex/values"
import { vVerdict } from "../workflows/validators"
import { type } from "arktype"
import { boardKinds } from "./boards"
import { arkId } from "../../lib/ark"
import { paginationOptsValidator } from "convex/server"

// What a board fetch hands to the mutation that saves it.
export const vFeedJob = v.object({
  url: v.string(),
  title: v.string(),
  company: v.string(),
  location: v.string(),
  remote: v.boolean(),
  postedAt: v.number(),
  text: v.string(),
})

// One role on the Jobs page, with Jev's verdict for the person looking, when a loop has
// judged it.
export const vJobRow = v.object({
  _id: v.id("jobs"),
  url: v.string(),
  title: v.string(),
  company: v.string(),
  location: v.string(),
  remote: v.boolean(),
  postedAt: v.number(),
  preview: v.string(),
  fit: v.union(v.null(), v.number()),
  verdict: v.union(v.null(), vVerdict),
})

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

export const vBoardFetchedArgs = {
  boardId: v.id("jobBoards"),
  startedAt: v.number(),
  jobs: v.number(),
  error: v.optional(v.string()),
  // The name the board's own roles give the company, which reads better than one
  // made from the board's address.
  company: v.optional(v.string()),
}

export const vCandidatesArgs = {
  userId: v.id("users"),
  queries: v.array(v.string()),
  remoteOnly: v.boolean(),
  companies: v.array(v.string()),
  since: v.optional(v.number()),
  limit: v.number(),
}

export const vJobSearchArgs = {
  q: v.optional(v.string()),
  remoteOnly: v.optional(v.boolean()),
  // A string, since it comes from the address; a bad one finds nothing instead of throwing.
  boardId: v.optional(v.string()),
  // Posted at or after this time; the page rounds it to the hour so it caches.
  since: v.optional(v.number()),
  fits: v.optional(v.boolean()),
  paginationOpts: paginationOptsValidator,
}
