import type { Preferences } from "@convex/api/features/preferences/validators"

type Values = typeof Preferences.inferIn

export type ReadyAnswer = { question: string; answer: string; step: string }

const list = (items: string[]) =>
  items.length < 2 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`

const sentences = (...parts: (string | false)[]) => parts.filter(Boolean).join(" ")

// Questions application forms ask over and over, answered from the person's own words.
// `step` is the Preferences step that holds the answer, for "Answer it" links.
export const readyAnswers = (v: Values): ReadyAnswer[] => [
  { question: "Tell us about yourself.", answer: v.identity.trim(), step: "identity" },
  {
    question: "What are you looking for in your next role?",
    answer: sentences(
      v.interests.length > 0 && `I'm most interested in ${list(v.interests)}.`,
      v.growthGoal.trim()
    ),
    step: "drawn",
  },
  { question: "Why do you want to work here?", answer: v.companyTraits.trim(), step: "companies" },
  {
    question: "Where are you based, and are you open to remote work or relocating?",
    answer: sentences(
      v.locations.length > 0 && `I'd like to work in ${list(v.locations)}.`,
      v.workMode === "remote" && "I prefer remote work.",
      v.workMode === "hybrid" && "I prefer a hybrid setup.",
      v.workMode === "onsite" && "I prefer working on-site."
    ),
    step: "where",
  },
  {
    question: "What are your salary expectations?",
    answer: v.answers.pay.trim(),
    step: "questions",
  },
  { question: "When can you start?", answer: v.answers.start.trim(), step: "questions" },
  {
    question: "Will you need visa sponsorship?",
    answer: v.answers.visa.trim(),
    step: "questions",
  },
  {
    question: "Which skills are you working on right now?",
    answer: v.skillsToBuild.length > 0 ? `I'm building my ${list(v.skillsToBuild)} skills.` : "",
    step: "grow",
  },
  ...(v.custom ?? [])
    .filter((c) => c.question.trim())
    .map((c) => ({ question: c.question.trim(), answer: c.answer.trim(), step: "own" })),
]
