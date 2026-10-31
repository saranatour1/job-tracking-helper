import { type } from "arktype"
import { v } from "convex/values"
import { arkId, arkOutputToConvex } from "../../lib/ark"
import { JobLead } from "../loops/validators"

export const prefillStatuses = [
  "preparing",
  "needsAnswers",
  "ready",
  "live",
  "applied",
  "dismissed",
  "failed",
] as const
export type PrefillStatus = (typeof prefillStatuses)[number]

// Where an answer came from: your saved answers by name, Jev's pick among them, a draft
// for you to check, or you, typing it on this application.
export const answerSources = ["saved", "jev", "ai", "you", "none"] as const

// One question on a posting's form. Demographic questions are left out, so they're never
// stored or answered. `entryKey` is the saved answer it came from, to stamp its usage.
export const PrefillField = type({
  question: "string",
  type: "string",
  required: "boolean",
  "options?": "string[]",
  "answer?": "string",
  source: type.enumerated(...answerSources),
  "entryKey?": "string",
  // What a location list tries when it doesn't have `answer`.
  "fallback?": "string",
  // Where it is in the open browser, so it can be sent there.
  "selector?": "string",
})
export type PrefillField = typeof PrefillField.infer

// A form is bounded and only ever read with its application, so this stays an array.
export const maxFields = 80
// A longer list, like every country, is left to type into.
export const maxOptions = 50

// One application made ready for you, one per person and posting. The app fills the form
// while you're there and you press its Submit, so nothing here can send by itself.
export const Prefill = type({
  userId: arkId("users"),
  "jobId?": arkId("jobs"),
  "leadId?": arkId("jobLeads"),
  urlKey: "string",
  url: "string",
  company: "string",
  title: "string",
  status: type.enumerated(...prefillStatuses),
  fields: PrefillField.array(),
  "preparedAt?": "number",
  // Controls the open browser, so only its owner's `get` ever returns it.
  "liveUrl?": "string",
  "scrapeId?": "string",
  // Questions that wouldn't fill, to do by hand in the live browser.
  "unfilled?": "string[]",
  "sentAt?": "number",
  "confirmation?": "string",
  "error?": "string",
  "credits?": "number",
  "applicationId?": arkId("applications"),
  // AI was unavailable when this was prepared, so only exact matches got answered.
  "aiUnavailable?": "boolean",
})

// A row for the lists, without what controls its browser.
export const PrefillListed = Prefill.omit("liveUrl", "scrapeId").and({
  _id: arkId("prefills"),
  _creationTime: "number",
})

export const maxAnswer = 2000

export const SetAnswer = type({
  id: arkId("prefills"),
  question: "string",
  answer: type("string.trim").to(
    type("string <= 2000").configure({ message: "Keep an answer under 2000 characters." })
  ),
  "keep?": "boolean",
})

// Rows the pages read at once: more than anyone reviews, and enough for the last while.
export const maxListed = 100

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

export const ConfirmResult = type({ confirmed: "boolean", text: "string" })

// What a run needs, read at once.
export const vRunPlan = v.union(
  v.null(),
  v.object({
    userId: v.id("users"),
    url: v.string(),
    status: v.union(...prefillStatuses.map((s) => v.literal(s))),
    fields: arkOutputToConvex(PrefillField.array()),
    answers: v.array(v.object({ key: v.string(), label: v.string(), value: v.string() })),
    company: v.string(),
    title: v.string(),
    postingText: v.string(),
    resumeText: v.string(),
    resume: v.union(
      v.null(),
      v.object({ id: v.id("_storage"), name: v.string(), mimeType: v.string() })
    ),
  })
)

export const vLeadSummary = v.union(
  v.null(),
  arkOutputToConvex(JobLead.pick("fit", "reasons", "verdict", "checks", "location"))
)

export const vSavePreparedArgs = {
  id: v.id("prefills"),
  fields: arkOutputToConvex(PrefillField.array()),
  credits: v.number(),
  aiUnavailable: v.optional(v.boolean()),
}

// The table this feature replaced. Nothing writes to it; the schema pass removes it.
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
