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

// A posting a run kept, ready to save as a lead.
export const vKept = v.object({
  url: v.string(),
  urlKey: v.string(),
  title: v.string(),
  company: v.string(),
  snippet: v.string(),
  fit: v.number(),
  reasons: v.array(v.string()),
})

export const vSpent = v.object({ provider: vProvider, credits: v.number() })
