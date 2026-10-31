import { type } from "arktype"
import { blankTemplate, dailySizes, loopTemplates, runTimes, showSizes } from "./catalog"
import { arkId } from "../../lib/ark"
import { providerIds, vProfile, vProvider, vPasted, vSpent } from "../workflows/validators"
import { v } from "convex/values"
import { vWorkflowId, vResultValidator } from "@convex-dev/workflow"

const trimmed = type("string.trim")

// A loop's answers: exactly the catalog's questions, each yes or no.
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

// What the setup screen sends to start a loop. Only the catalog's choices pass.
export const NewLoop = type({
  name: trimmed.to(type("0 < string <= 60").describe("1 to 60 characters")),
  template: type.enumerated(blankTemplate.id, ...loopTemplates.map((t) => t.id)),
  answers: LoopAnswers,
  prompt: trimmed.to(type("string <= 500").describe("at most 500 characters")),
  daily: type.enumerated(...dailySizes),
  show: type.enumerated(...showSizes),
  at: type.enumerated(...runTimes),
  timeZone: "0 < string <= 64",
  // Runs by itself every morning; when no, it runs only when the person presses Run now.
  auto: "boolean",
})

// Jev's overall match for one role, 0 to 3 on the match levels in judge.ts. `avoids`
// and `inPlace` are from leads judged before the breakdown, as the probability of yes.
export const Judgment = type({
  match: "number",
  "avoids?": "number",
  "inPlace?": "number",
  level: "string",
  model: "string",
})

// One line of a role's breakdown: what the person asked for and whether the posting
// shows it holds (fits), leaves it open (maybe) or shows it doesn't (notFit).
export const Check = type({
  kind: "'want' | 'need' | 'avoid'",
  label: "string",
  result: "'fits' | 'maybe' | 'notFit'",
  confidence: "number",
  "must?": "boolean",
})

// A role judged for someone, by a loop's run or because they pasted its link. `verdict`
// is Jev's call, `reasons` say why in words and `checks` break it down per thing they
// asked for. `status` is where it stands: "new" is on their shortlist, "waiting" is a fit
// held back so the shortlist stays short, "unfit" never shows. `feedback` is their
// "more like this" or "not like this", which shapes the next morning's runs. `urlKey`
// is the cleaned-up URL, so a role someone has been shown never comes back. Leads from
// before Jev have no verdict, and ones from before the breakdown have no checks.
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
  // A pasted link's text, when it isn't in the catalog.
  "text?": "string",
  fit: "number",
  reasons: "string[]",
  status: type.enumerated(...leadStatuses),
  "jobId?": arkId("jobs"),
  "verdict?": type.enumerated(...verdicts),
  "checks?": Check.array(),
  "judgment?": Judgment,
  "feedback?": "'more' | 'less'",
  "applicationId?": arkId("applications"),
})

// A role Jev judged, waiting for the run to save it.
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

// One morning's run of a loop. The workflow component keeps the steps; this keeps
// what the Runs tab shows: `scanned` roles judged, `kept` fits saved, `credits` spent
// finding boards. `saved` and `applied` count the run's leads as people act.
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
  // What Jev cost this run, in US dollars.
  "cost?": "number",
  startedAt: "number",
  "finishedAt?": "number",
  "note?": "string",
  // While Jev is judging on the batch worker: how many are left, and what it said so far.
  "readsLeft?": "number",
  // The judgments' ids on the batch worker, so stopping a run can cancel the rest.
  "readWorkIds?": "string[]",
  "candidates?": Candidate.array(),
  "readFailures?": "number",
})

// A person's saved search. `nextRunAt` is when the cron should next start it; `active`
// false means it runs only when the person presses Run now.
export const Loop = type({
  userId: arkId("users"),
  name: "string",
  template: "string",
  // `digest` is optional so loops saved before that question was dropped stay valid.
  answers: LoopAnswers,
  // The person's own words for the job they want; Jev judges each role against it.
  "prompt?": "string",
  daily: "number",
  // How many fits it puts on the shortlist at a time; loops from before it show 5.
  "show?": "number",
  at: "string",
  timeZone: "string",
  active: "boolean",
  nextRunAt: "number",
})

// Credits each source has used this month, shared by everyone. `exhaustedAt` is set
// when the source said it was out, so runs skip it until the month changes.
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

export const vFits = v.array(
  v.object({ applicationId: v.id("applications"), fit: v.number(), isFit: v.boolean() })
)

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
