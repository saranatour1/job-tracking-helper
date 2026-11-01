import { type } from "arktype"
import { arkId } from "../../lib/ark"

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

// Withdrawn isn't here because it can happen from Saved.
export const sentStatuses: readonly Status[] = ["applied", "interviewing", "offer", "rejected"]
export const isSent = (status: Status) => sentStatuses.includes(status)

export const priorities = ["urgent", "high", "medium", "low", "none"] as const
export type Priority = (typeof priorities)[number]

export const methods = ["Company site", "LinkedIn", "Referral", "Recruiter", "Email"] as const
export type Method = (typeof methods)[number]

export const limits = { labels: 20, history: 100, tasks: 50, notes: 100 } as const

export const maxApplications = 2000

const filled = type("string.trim").to("string > 0")
const label = type("string.trim").to("0 < string <= 40")

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
  "url?": "string",
}).and(Details)
export type Application = typeof Application.infer

export const priorityFor = (fit: number): Priority =>
  fit >= 90 ? "high" : fit >= 75 ? "medium" : "low"

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
