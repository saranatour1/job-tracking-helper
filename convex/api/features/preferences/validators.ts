import { type } from "arktype"

const trimmed = type("string.trim")

// Preferences: what someone wants from their next job, in their own words.
// Lists are short tags; free text stays short enough to read at a glance.
const tag = trimmed.to(type("0 < string <= 60").describe("1 to 60 characters"))
const tags = tag.array().atMostLength(40)
const text = trimmed.to(type("string <= 2000").describe("at most 2000 characters"))

export const workModes = ["any", "remote", "hybrid", "onsite"] as const

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
export const PreferencesDraft = Preferences.omit("answers")
  .partial()
  .and({ "answers?": Answers.partial() })
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
