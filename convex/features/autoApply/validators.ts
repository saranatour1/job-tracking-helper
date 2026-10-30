import { type } from "arktype"
import { arkId, arkOutputToConvex } from "../../lib/ark"
import { v } from "convex/values"

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

// What the scripts print, checked before use.
export const ReadResult = type({
  login: "boolean",
  captcha: "boolean",
  fields: type({
    selector: "string",
    name: "string",
    type: "string",
    label: "string",
    required: "boolean",
    "options?": "string[]",
  })
    .array()
    .or("null"),
  "submit?": "string | null",
})

export const FillResult = type({
  unfilled: type({ label: "string", reason: "string" }).array(),
  errors: "string[]",
})

export const SubmitResult = type({
  outcome: "'confirmed' | 'errors' | 'captcha' | 'unknown'",
  url: "string",
  text: "string",
})

export const vStatus = v.union(...applyStatuses.map((s) => v.literal(s)))

// Rows the Activity page reads at once.
export const maxListed = 100

export type Used = typeof UsedAnswer.infer

export type Missing = typeof MissingQuestion.infer

export const vRunPlan = v.union(
  v.null(),
  v.object({
    userId: v.id("users"),
    url: v.string(),
    dryRun: v.boolean(),
    answers: v.array(v.object({ key: v.string(), label: v.string(), value: v.string() })),
    resume: v.union(
      v.null(),
      v.object({ id: v.id("_storage"), name: v.string(), mimeType: v.string() })
    ),
  })
)

export const vFinishArgs = {
  autoApplyId: v.id("autoApplies"),
  status: vStatus,
  used: v.optional(arkOutputToConvex(UsedAnswer.array())),
  missing: v.optional(arkOutputToConvex(MissingQuestion.array())),
  confirmation: v.optional(v.string()),
  error: v.optional(v.string()),
  credits: v.optional(v.number()),
}
