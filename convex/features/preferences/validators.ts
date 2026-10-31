import { type } from "arktype"
import { arkId, arkOutputToConvex } from "../../lib/ark"
import { v } from "convex/values"

const trimmed = type("string.trim")

const tag = trimmed.to(type("0 < string <= 60").describe("1 to 60 characters"))
const tags = tag.array().atMostLength(40)
const text = trimmed.to(type("string <= 2000").describe("at most 2000 characters"))

export const workModes = ["any", "remote", "hybrid", "onsite"] as const
export type WorkMode = (typeof workModes)[number]

export const Answers = type({
  offer: text,
  leave: text,
  goodWeek: text,
  pay: text,
  visa: text,
  start: text,
})

export const CustomAnswer = type({
  question: trimmed.to(type("0 < string <= 200").describe("1 to 200 characters")),
  answer: text,
})

const repeatOf = (names: string[]) => {
  const keys = names.map((n) => n.trim().toLowerCase())
  return names.find((_, i) => keys.indexOf(keys[i]!) !== i)?.trim()
}

export const PrefilledField = type({
  label: trimmed.to(type("0 < string <= 80").describe("1 to 80 characters")),
  value: text,
})

// Repeat checks run before trimming, so the stored shapes keep their JSON Schema.
export const PrefilledFields = type({ label: "string", value: "string" })
  .array()
  .narrow((fields, ctx) => {
    const repeat = repeatOf(fields.map((f) => f.label))
    return repeat === undefined || ctx.reject({ message: `"${repeat}" is listed twice` })
  })
  .pipe(PrefilledField.array().atMostLength(50))

export const PrefilledSection = type({
  title: trimmed.to(type("0 < string <= 60").describe("1 to 60 characters")),
  fields: PrefilledFields,
})

export const PrefilledSections = type({ title: "string", fields: PrefilledFields.in })
  .array()
  .narrow((sections, ctx) => {
    const repeat = repeatOf(sections.map((s) => s.title))
    return repeat === undefined || ctx.reject({ message: `There are two "${repeat}" sections` })
  })
  .pipe(PrefilledSection.array().atMostLength(20))

export const Preferences = type({
  interests: tags,
  avoid: tags,
  growthGoal: text,
  skillsToBuild: tags,
  locations: tags,
  workMode: type.enumerated(...workModes),
  companies: tags,
  companyTraits: text,
  redFlagCompanies: tags,
  redFlags: text,
  identity: text,
  answers: Answers,
  custom: CustomAnswer.array().atMostLength(20),
})
export type Preferences = typeof Preferences.infer

// With every answer optional, an array would pass as an empty object, so refuse one.
const AnswersDraft = Answers.partial().narrow(
  (answers, ctx) => !Array.isArray(answers) || ctx.mustBe("an object")
)

export const PreferencesDraft = Preferences.omit("answers")
  .partial()
  .and({ "answers?": AnswersDraft })
  .onDeepUndeclaredKey("delete")

export const emptyPreferences: typeof Preferences.inferIn = {
  interests: [],
  avoid: [],
  growthGoal: "",
  skillsToBuild: [],
  locations: [],
  workMode: "any",
  companies: [],
  companyTraits: "",
  redFlagCompanies: [],
  redFlags: "",
  identity: "",
  answers: { offer: "", leave: "", goodWeek: "", pay: "", visa: "", start: "" },
  custom: [],
}

export const maxResumeBytes = 10 * 1024 * 1024
export const resumeTypes = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "text/plain",
]

export const tagKinds = [
  "interest",
  "avoid",
  "skill",
  "location",
  "company",
  "redFlagCompany",
] as const

export const entryKinds = ["answer", "field"] as const

export const Check = type({
  name: "string",
  ok: "boolean",
  fix: "string",
})

export const Review = type({
  at: "number",
  contact: type({
    "name?": "string",
    "email?": "string",
    "phone?": "string",
    links: "string[]",
  }),
  sections: "string[]",
  checks: Check.array(),
  suggestions: "string[]",
  shows: type({ tag: "string", shown: "'yes' | 'no' | 'unsure'" }).array(),
  words: "number",
  "note?": "string",
})

export type Review = typeof Review.infer

export const ProfileEntry = type({
  userId: arkId("users"),
  kind: type.enumerated(...entryKinds),
  group: "string",
  key: "string",
  label: "string",
  value: "string",
  order: "number",
  "lastUsedAt?": "number",
  "useCount?": "number",
  // Written by a connected agent, and not yet saved by the person. Forms don't use these.
  "byAgent?": "boolean",
})

export const PreferenceSettings = type({
  userId: arkId("users"),
  workMode: type.enumerated(...workModes),
  "resumeId?": arkId("_storage"),
  "resumeName?": "string",
  "resumeText?": "string",
  "resumeReview?": Review,
  "prefilledAt?": "number",
})

export const PreferenceTag = type({
  userId: arkId("users"),
  kind: type.enumerated(...tagKinds),
  value: "string",
  order: "number",
})

export const vPreferencesView = v.object({
  settings: v.union(
    v.object({
      workMode: v.union(...workModes.map((m) => v.literal(m))),
      prefilledAt: v.optional(v.number()),
    }),
    v.null()
  ),
  resume: v.union(v.object({ name: v.string(), url: v.union(v.string(), v.null()) }), v.null()),
  review: v.union(arkOutputToConvex(Review), v.null()),
})

export const vResumeToReview = v.union(
  v.null(),
  v.object({
    resumeId: v.id("_storage"),
    contentType: v.string(),
    skills: v.array(v.string()),
    interests: v.array(v.string()),
  })
)

export const SavePrefilled = type({ sections: PrefilledSections })

export const SetResume = type({ "resumeId?": arkId("_storage"), "name?": "string <= 200" })
