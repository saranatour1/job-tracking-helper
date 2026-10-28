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
})

export const vPosting = v.object({ url: v.string(), title: v.string(), snippet: v.string() })

export const vProfile = v.object({ ...vCriteria.fields, prompt: v.optional(v.string()) })

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
  snippet: v.string(),
  verdict: vVerdict,
  fit: v.number(),
  reasons: v.array(v.string()),
  judgment: vJudgment,
})

// What judging one role sends back to the run. `judged` is null when the role closed.
export const vJudgeResult = v.object({ cost: v.number(), judged: v.union(v.null(), vJudged) })

export const vSpent = v.object({ provider: vProvider, credits: v.number() })
