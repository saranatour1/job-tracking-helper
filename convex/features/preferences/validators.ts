import { type } from "arktype"
import { arkId, arkOutputToConvex } from "../../lib/ark"
import { v } from "convex/values"

const trimmed = type("string.trim")

// Preferences: what someone wants from their next job, in their own words.
// Lists are short tags; free text stays short enough to read at a glance.
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

// A question someone thinks matters, with their answer: "Do you have a portfolio?" "Yes, at ..."
export const CustomAnswer = type({
  question: trimmed.to(type("0 < string <= 200").describe("1 to 200 characters")),
  answer: text,
})

// The first name used twice in a list, ignoring case and spaces.
const repeatOf = (names: string[]) => {
  const keys = names.map((n) => n.trim().toLowerCase())
  return names.find((_, i) => keys.indexOf(keys[i]!) !== i)?.trim()
}

// A form field and what to put in it, such as "LinkedIn" and a profile link.
export const PrefilledField = type({
  label: trimmed.to(type("0 < string <= 80").describe("1 to 80 characters")),
  value: text,
})

// Repeat checks run before trimming, so the stored shapes keep their JSON Schema.
// Labels are used once per section, so a form field never has two answers.
export const PrefilledFields = type({ label: "string", value: "string" })
  .array()
  .narrow((fields, ctx) => {
    const repeat = repeatOf(fields.map((f) => f.label))
    return repeat === undefined || ctx.reject({ message: `"${repeat}" is listed twice` })
  })
  .pipe(PrefilledField.array().atMostLength(50))

// A titled group of fields, such as "Contact" or "References".
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
  // Optional so rows saved before this field existed stay valid.
  "custom?": CustomAnswer.array().atMostLength(20),
})
export type Preferences = typeof Preferences.infer

// What an AI assistant's reply may contain: any subset of the fields, unknown keys dropped.
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

// A resume is kept only to attach where a form asks for one; nothing reads it.
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
  // What to change when it isn't ok.
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
  // Standard headings found, in order.
  sections: "string[]",
  checks: Check.array(),
  suggestions: "string[]",
  // Each skill and interest from Preferences, and whether the resume shows it. Unsure
  // means Jev couldn't tell, which is neither advice nor a pass.
  shows: type({ tag: "string", shown: "'yes' | 'no' | 'unsure'" }).array(),
  words: "number",
  // Set when Jev couldn't answer, so the review is the rules alone.
  "note?": "string",
})

export type Review = typeof Review.infer

// A label and a value: an answer to a question (`answer`), or a form field from the
// Prefilled tab (`field`). `group` is the Preferences step or the Prefilled section,
// and `key` names a built-in question so its label can change without a migration.
export const ProfileEntry = type({
  userId: arkId("users"),
  kind: type.enumerated(...entryKinds),
  group: "string",
  key: "string",
  label: "string",
  value: "string",
  order: "number",
  // For `field` rows: when auto-apply last put this answer in a form, and how often.
  "lastUsedAt?": "number",
  "useCount?": "number",
})

// One small row per user: settings that have a single value. Lists and answers live
// in `preferenceTags` and `profileEntries`, one row each, so this row never grows.
export const PreferenceSettings = type({
  userId: arkId("users"),
  workMode: type.enumerated(...workModes),
  "resumeId?": arkId("_storage"),
  "resumeName?": "string",
  // The resume's text and its last review, set by Review on the Resume tab and
  // cleared when the file changes.
  "resumeText?": "string",
  "resumeReview?": Review,
  // Set the first time the Prefilled tab is saved; until then the page suggests fields.
  "prefilledAt?": "number",
})

// One short word or phrase per row: an interest, a skill, a place, a company. `kind`
// says which list it belongs to, and `order` keeps the order it was added in.
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
  // The last review of the resume, until the file changes.
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
