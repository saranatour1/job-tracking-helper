import { v, type VBoolean } from "convex/values"
import { type LoopQuestion, loopQuestions } from "../loops/catalog"
import { providerIds } from "../loops/validators"

// Convex validators for what passes between a run's steps.

export const vProvider = v.union(...providerIds.map((p) => v.literal(p)))

const answerFields = Object.fromEntries(
  Object.keys(loopQuestions).map((q) => [q, v.boolean()])
) as Record<LoopQuestion, VBoolean>

export const vCriteria = v.object({
  ...answerFields,
  interests: v.array(v.string()),
  skills: v.array(v.string()),
  places: v.array(v.string()),
  companies: v.array(v.string()),
  avoid: v.array(v.string()),
  redFlagCompanies: v.array(v.string()),
})

export const vPosting = v.object({ url: v.string(), title: v.string(), snippet: v.string() })

// Everything Jev judges a role against; see Profile in judge.ts.
export const vProfile = v.object({
  prompt: v.optional(v.string()),
  interests: v.array(v.string()),
  skills: v.array(v.string()),
  stretch: v.boolean(),
  place: v.optional(v.string()),
  avoid: v.array(v.string()),
  redFlagCompanies: v.array(v.string()),
  pay: v.optional(v.string()),
  visa: v.optional(v.string()),
  liked: v.array(v.string()),
  disliked: v.array(v.string()),
})

// One line of a role's breakdown: fits, could fit, or doesn't fit.
export const vCheck = v.object({
  kind: v.union(v.literal("want"), v.literal("need"), v.literal("avoid")),
  label: v.string(),
  result: v.union(v.literal("fits"), v.literal("maybe"), v.literal("notFit")),
  confidence: v.number(),
  must: v.optional(v.boolean()),
})

// Jev's answers for one role, kept with the verdict so they can be checked later.
export const vJudgment = v.object({
  match: v.number(),
  avoids: v.optional(v.number()),
  inPlace: v.optional(v.number()),
  level: v.string(),
  model: v.string(),
})

export const vVerdict = v.union(v.literal("fit"), v.literal("notFit"))

// A role Jev judged, ready to save for the person.
export const vJudged = v.object({
  jobId: v.id("jobs"),
  url: v.string(),
  urlKey: v.string(),
  title: v.string(),
  company: v.string(),
  location: v.string(),
  snippet: v.string(),
  verdict: vVerdict,
  fit: v.number(),
  reasons: v.array(v.string()),
  checks: v.array(vCheck),
  judgment: vJudgment,
})

// A pasted link's verdict: like a run's, but it may not be in the catalog, so it can
// carry its own text.
export const vPasted = v.object({
  ...vJudged.fields,
  jobId: v.optional(v.id("jobs")),
  text: v.optional(v.string()),
})

// What judging one role sends back to the run. `judged` is null when the role closed.
export const vJudgeResult = v.object({ cost: v.number(), judged: v.union(v.null(), vJudged) })

export const vSpent = v.object({ provider: vProvider, credits: v.number() })
