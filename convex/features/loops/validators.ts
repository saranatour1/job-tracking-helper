import { type } from "arktype"
import { blankTemplate, dailySizes, loopTemplates, runTimes, showSizes } from "./catalog"
import { arkId } from "../../lib/ark"
import { providerIds, vProfile, vProvider, vPasted, vSpent } from "../workflows/validators"
import { v } from "convex/values"
import { vWorkflowId, vResultValidator } from "@convex-dev/workflow"

const trimmed = type("string.trim")

export const LoopAnswers = type({
  usePreferences: "boolean",
  stretch: "boolean",
  remoteOnly: "boolean",
  nearMe: "boolean",
  listedCompanies: "boolean",
  skipRedFlags: "boolean",
  postedToday: "boolean",
})
export const runStatuses = ["queued", "running", "done", "failed", "skipped", "stopped"] as const
export const leadStatuses = ["new", "waiting", "saved", "dismissed", "applied", "unfit"] as const
export const verdicts = ["fit", "notFit"] as const

export const NewLoop = type({
  name: trimmed.to(type("0 < string <= 60").describe("1 to 60 characters")),
  template: type.enumerated(blankTemplate.id, ...loopTemplates.map((t) => t.id)),
  answers: LoopAnswers,
  prompt: trimmed.to(type("string <= 500").describe("at most 500 characters")),
  daily: type.enumerated(...dailySizes),
  show: type.enumerated(...showSizes),
  at: type.enumerated(...runTimes),
  timeZone: "0 < string <= 64",
  auto: "boolean",
})

export const Judgment = type({
  match: "number",
  level: "string",
  model: "string",
})

export const Check = type({
  kind: "'want' | 'need' | 'avoid'",
  label: "string",
  result: "'fits' | 'maybe' | 'notFit'",
  confidence: "number",
  "must?": "boolean",
})

export const JobLead = type({
  userId: arkId("users"),
  "loopId?": arkId("loops"),
  "runId?": arkId("loopRuns"),
  url: "string",
  urlKey: "string",
  title: "string",
  company: "string",
  "location?": "string",
  snippet: "string",
  "text?": "string",
  fit: "number",
  reasons: "string[]",
  status: type.enumerated(...leadStatuses),
  "jobId?": arkId("jobs"),
  verdict: type.enumerated(...verdicts),
  "checks?": Check.array(),
  "judgment?": Judgment,
  "feedback?": "'more' | 'less'",
  "applicationId?": arkId("applications"),
})

export const Candidate = type({
  jobId: arkId("jobs"),
  url: "string",
  urlKey: "string",
  title: "string",
  company: "string",
  location: "string",
  snippet: "string",
  verdict: type.enumerated(...verdicts),
  fit: "number",
  reasons: "string[]",
  checks: Check.array(),
  judgment: Judgment,
})

export const LoopRun = type({
  loopId: arkId("loops"),
  userId: arkId("users"),
  loopName: "string",
  "workflowId?": "string",
  status: type.enumerated(...runStatuses),
  "provider?": type.enumerated(...providerIds),
  scanned: "number",
  kept: "number",
  saved: "number",
  applied: "number",
  credits: "number",
  "cost?": "number",
  startedAt: "number",
  "finishedAt?": "number",
  "note?": "string",
  "readsLeft?": "number",
  "readWorkIds?": "string[]",
  "candidates?": Candidate.array(),
  "readFailures?": "number",
})

// One finished judgment, waiting for the worker that adds it to its run.
export const JudgedRead = type({
  runId: arkId("loopRuns"),
  failed: "boolean",
  cost: "number",
  "judged?": Candidate,
})

export const Loop = type({
  userId: arkId("users"),
  name: "string",
  template: "string",
  answers: LoopAnswers,
  "prompt?": "string",
  daily: "number",
  show: "number",
  at: "string",
  timeZone: "string",
  active: "boolean",
  nextRunAt: "number",
})

export const SourceUsage = type({
  provider: type.enumerated(...providerIds),
  month: "string",
  used: "number",
  "exhaustedAt?": "number",
})

export const vRunPlan = v.union(
  v.null(),
  v.object({
    userId: v.id("users"),
    profile: vProfile,
    queries: v.array(v.string()),
    perQuery: v.number(),
    daily: v.number(),
    postedToday: v.boolean(),
    since: v.optional(v.number()),
    remoteOnly: v.boolean(),
    companies: v.array(v.string()),
    sources: v.array(vProvider),
  })
)

export const vSavePastedArgs = {
  userId: v.id("users"),
  lead: vPasted,
  credits: v.number(),
  applicationId: v.optional(v.id("applications")),
}

export const vFinishRunArgs = {
  runId: v.id("loopRuns"),
  provider: v.optional(vProvider),
  spent: v.array(vSpent),
  exhausted: v.array(vProvider),
  note: v.optional(v.string()),
}

export const vRunEndedArgs = {
  workflowId: vWorkflowId,
  result: vResultValidator,
  context: v.object({ runId: v.id("loopRuns") }),
}

export const UpdateLoop = NewLoop.and({ loopId: arkId("loops") })

export const vRespondArgs = {
  leadId: v.id("jobLeads"),
  action: v.union(v.literal("save"), v.literal("favorite"), v.literal("dismiss")),
}

export const vSourceStatus = v.array(
  v.object({
    provider: v.union(...providerIds.map((p) => v.literal(p))),
    configured: v.boolean(),
    used: v.number(),
    limit: v.number(),
    exhausted: v.boolean(),
    usable: v.boolean(),
  })
)
