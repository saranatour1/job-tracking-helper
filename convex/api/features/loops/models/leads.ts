import { defineTable } from "convex/server"
import { type } from "arktype"
import { arkId, arkOutputToConvex } from "../../../../lib/ark"
import { leadStatuses, verdicts } from "../validators"

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

export const jobLeadsTable = defineTable(arkOutputToConvex(JobLead))
  .index("by_userId_and_urlKey", ["userId", "urlKey"])
  .index("by_runId", ["runId"])
  .index("by_userId_and_status", ["userId", "status"])
  .index("by_userId_and_feedback", ["userId", "feedback"])
  // The job behind an application, for its side panel.
  .index("by_applicationId", ["applicationId"])
  // The fits of someone's applications, for the badges on the board.
  .index("by_userId_and_applicationId", ["userId", "applicationId"])
