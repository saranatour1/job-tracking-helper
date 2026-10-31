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

export const answerSources = ["saved", "jev", "ai", "you", "none"] as const

export const PrefillField = type({
  question: "string",
  type: "string",
  required: "boolean",
  "options?": "string[]",
  "answer?": "string",
  source: type.enumerated(...answerSources),
  "entryKey?": "string",
  "fallback?": "string",
  "selector?": "string",
  "fill?": "'filled' | 'byHand'",
})
export type PrefillField = typeof PrefillField.infer

export const maxFields = 80
export const maxOptions = 50

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
  "liveUrl?": "string",
  "scrapeId?": "string",
  "unfilled?": "string[]",
  "sentAt?": "number",
  "confirmation?": "string",
  "error?": "string",
  "credits?": "number",
  "applicationId?": arkId("applications"),
  "aiUnavailable?": "boolean",
})

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

export const maxListed = 100

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
