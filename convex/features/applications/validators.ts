import { type } from "arktype"
import { arkId } from "../../lib/ark"

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

export const statusLabels: Record<Status, string> = {
  saved: "Saved",
  applied: "Applied",
  interviewing: "Interviewing",
  offer: "Offer",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
}

export const priorities = ["urgent", "high", "medium", "low", "none"] as const
export type Priority = (typeof priorities)[number]

// How the person applied.
export const methods = ["Company site", "LinkedIn", "Referral", "Recruiter", "Email"] as const
export type Method = (typeof methods)[number]

// Caps from docs/database-design.md: lists on an application stay small enough to
// read with it.
export const limits = { labels: 20, history: 100, tasks: 50, notes: 100 } as const

// The board filters and counts in the browser, so it loads a person's applications whole.
// Past this it keeps the newest and says so. More than anyone's job search needs.
export const maxApplications = 2000

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

// How much a role is worth chasing, from how well Jev judged it fits (0–100).
export const priorityFor = (fit: number): Priority =>
  fit >= 90 ? "high" : fit >= 75 ? "medium" : "low"

// Kept on the application by the server: each status it moved to, and notes, with when.
export const Event = type({ status: type.enumerated(...statuses), at: "number", "note?": "string" })
export const Note = type({ text: "string", at: "number" })

export const archiveDays = 30

export const defaultTrashDays = 90

export const trashDayChoices = [0, 30, 90, 180, 365] as const

export const UpdateApplication = type({ id: arkId("applications") })
  .and(Details)
  .and({
    "company?": type("string.trim").to("string > 0"),
    "role?": type("string.trim").to("string > 0"),
  })

export const SetStatus = type({
  id: arkId("applications"),
  status: type.enumerated(...statuses),
  "note?": "string <= 500",
})

export const AddNote = type({
  id: arkId("applications"),
  text: type("string.trim").to("0 < string <= 5000"),
})
