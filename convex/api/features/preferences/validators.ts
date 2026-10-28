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
