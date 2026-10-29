import { type } from "arktype"

// Shared by the tracker's forms and the `applications:*` mutations. Kept free of
// convex/server imports so the frontend can import it without bundling them.
// "saved" is a job someone added to track before applying, often from a loop.
export const statuses = [
  "saved",
  "applied",
  "interviewing",
  "offer",
  "rejected",
  "withdrawn",
] as const
export type Status = (typeof statuses)[number]

export const priorities = ["urgent", "high", "medium", "low", "none"] as const
export type Priority = (typeof priorities)[number]

// How the person applied.
export const methods = ["Company site", "LinkedIn", "Referral", "Recruiter", "Email"] as const
export type Method = (typeof methods)[number]

// Caps from docs/database-design.md: lists on an application stay small enough to
// read with it.
export const limits = { labels: 20, history: 100, tasks: 50, notes: 100 } as const

const filled = type("string.trim").to("string > 0")
const label = type("string.trim").to("0 < string <= 40")

// What someone can set on an application. Every detail is optional, so applications
// from before they existed still read.
export const Details = type({
  "priority?": type.enumerated(...priorities),
  "labels?": label.array().atMostLength(limits.labels),
  "method?": type.enumerated(...methods),
  "location?": "string <= 200",
  "description?": "string <= 5000",
  "tasks?": type({ title: type("string.trim").to("0 < string <= 200"), done: "boolean" })
    .array()
    .atMostLength(limits.tasks),
})

export const Application = type({
  company: filled,
  role: filled,
  status: type.enumerated(...statuses),
  // The posting, when the job came from a loop or a pasted link.
  "url?": "string",
}).and(Details)
export type Application = typeof Application.infer

// Kept on the application by the server: each status it moved to, and notes, with when.
export const Event = type({ status: type.enumerated(...statuses), at: "number", "note?": "string" })
export const Note = type({ text: "string", at: "number" })
