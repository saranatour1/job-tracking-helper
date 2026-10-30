import { v } from "convex/values"
import { vVerdict } from "../workflows/validators"

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
