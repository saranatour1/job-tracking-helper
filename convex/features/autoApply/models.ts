import { type } from "arktype"
import { defineTable } from "convex/server"
import { arkId, arkOutputToConvex } from "../../lib/ark"

// "previewed" ends a dry run: filled, nothing sent.
export const applyStatuses = [
  "queued",
  "running",
  "needsYou",
  "previewed",
  "applied",
  "failed",
] as const
export type ApplyStatus = (typeof applyStatuses)[number]

// A saved answer the run put in the form, by the Prefilled row it came from.
export const UsedAnswer = type({ key: "string", label: "string" })
// A form question nothing saved could answer.
export const MissingQuestion = type({ question: "string", required: "boolean" })

// One job in someone's auto-apply pile, and how its run went. One row per person and
// posting (`urlKey`), so a posting is never applied to twice.
export const AutoApply = type({
  userId: arkId("users"),
  "jobId?": arkId("jobs"),
  urlKey: "string",
  url: "string",
  company: "string",
  title: "string",
  status: type.enumerated(...applyStatuses),
  queuedAt: "number",
  "startedAt?": "number",
  // Set right before the submit click. While it's set, nothing may submit this posting
  // again, even if the run died before it saw a confirmation.
  "submittedAt?": "number",
  "finishedAt?": "number",
  // Fill and read back, but stop before the submit click.
  "dryRun?": "boolean",
  // The pool's work id while queued, so it can be canceled.
  "workId?": "string",
  "credits?": "number",
  used: UsedAnswer.array(),
  missing: MissingQuestion.array(),
  // What the page said after submitting, or why the run stopped.
  "confirmation?": "string",
  "error?": "string",
  "applicationId?": arkId("applications"),
})

export const autoAppliesTable = defineTable(arkOutputToConvex(AutoApply))
  .index("by_userId_and_queuedAt", ["userId", "queuedAt"])
  .index("by_userId_and_urlKey", ["userId", "urlKey"])
