import type { Review } from "./validators"

// What a review of a resume finds, from rules on its text and Jev's answers. Rules here
// are the ATS side: what a parser needs to read a resume. Jev answers fixed questions
// about the writing, and `suggestionsFrom` turns its "no"s into advice. Jev never writes
// the advice itself. Kept free of convex/server imports so the frontend can share it.

// Review at most this much text; a resume is one or two pages.
export const maxResumeChars = 20_000

// The headings an ATS looks for, with the words a resume might use for each.
const headings: [string, RegExp][] = [
  ["Summary", /^(professional\s+)?(summary|profile|about( me)?|objective)\b/i],
  [
    "Experience",
    /^(work\s+|professional\s+|relevant\s+)?(experience|employment( history)?|work history)\b/i,
  ],
  ["Education", /^education\b/i],
  ["Skills", /^(technical\s+|core\s+|key\s+)?(skills|competencies|technologies)\b/i],
  ["Projects", /^(selected\s+|personal\s+)?projects?\b/i],
  ["Certifications", /^(certifications?|licenses?)\b/i],
]

const email = /[\w.+-]+@[\w-]+(\.[\w-]+)+/
const phone = /(\+?\d[\d\s().-]{7,}\d)/
const link = /\b(?:https?:\/\/|www\.)[^\s|,;)]+|\b(?:linkedin\.com|github\.com)\/[^\s|,;)]+/gi
const monthYear = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{4}\b/gi
const numericDate = /\b\d{1,2}\/\d{4}\b/g

const lines = (text: string) =>
  text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)

/** The headings found, in the order they appear. */
export const sectionsOf = (text: string) => {
  const found: string[] = []
  for (const line of lines(text)) {
    if (line.length > 40) continue
    const hit = headings.find(([, re]) => re.test(line))
    if (hit && !found.includes(hit[0])) found.push(hit[0])
  }
  return found
}

/** Contact details, from the top of the resume. The name is the first short line. */
export const contactOf = (text: string): Review["contact"] => {
  const top = lines(text).slice(0, 12)
  const name = top.find(
    (l) =>
      l.length <= 50 && !email.test(l) && !phone.test(l) && !/[@/:]/.test(l) && /[a-z]/i.test(l)
  )
  const head = top.join("\n")
  return {
    ...(name && { name }),
    ...(email.exec(head)?.[0] && { email: email.exec(head)![0] }),
    ...(phone.exec(head)?.[0] && { phone: phone.exec(head)![0].trim() }),
    links: [...new Set((head.match(link) ?? []).map((l) => l.replace(/[.,]$/, "")))].slice(0, 5),
  }
}

export const wordsOf = (text: string) => text.split(/\s+/).filter(Boolean).length

/** The ATS checks: can a parser read this resume? Each failure says what to change. */
export const checksOf = (text: string): Review["checks"] => {
  const contact = contactOf(text)
  const sections = sectionsOf(text)
  const all = lines(text)
  // Columns and tables come out as runs of spaces or tabs in the middle of lines.
  const columns = all.filter((l) => /\S(\t|\s{4,})\S/.test(l)).length
  const monthDates = (text.match(monthYear) ?? []).length
  const numericDates = (text.match(numericDate) ?? []).length
  const words = wordsOf(text)
  return [
    {
      name: "Email address at the top",
      ok: Boolean(contact.email),
      fix: "Put your email in the first lines, as plain text, not in a header image or table.",
    },
    {
      name: "Phone number at the top",
      ok: Boolean(contact.phone),
      fix: "Put your phone number in the first lines, with the country code if you apply abroad.",
    },
    {
      name: "Standard section headings",
      ok:
        sections.includes("Experience") &&
        sections.includes("Education") &&
        sections.includes("Skills"),
      fix: `Use the headings Experience, Education and Skills; found: ${sections.join(", ") || "none"}.`,
    },
    {
      name: "Single column, no tables",
      ok: columns < Math.max(3, all.length / 8),
      fix: "Lay it out in one column with no tables or text boxes; parsers read columns out of order.",
    },
    {
      name: "Dates in one format",
      ok: !(monthDates > 0 && numericDates > 0),
      fix: "Write every date the same way, like Mar 2024, so a parser reads your timeline.",
    },
    {
      name: "One or two pages",
      ok: words >= 150 && words <= 1100,
      fix:
        words < 150
          ? "The text is very short; if the resume is a scan or an image, re-export it as text."
          : "Keep it to two pages; cut older roles to one line each.",
    },
  ]
}

// The questions Jev answers about the writing, in the order the advice is given.
export const writingQuestions = {
  summaryStatesRole:
    "Does the resume's summary or first lines say what role the person is looking for?",
  resultsInBullets:
    "Do most experience bullets give a measurable result, like a number, a percentage or an outcome?",
  recentFirst: "Is the most recent role listed first, with the others in reverse order?",
  activeVerbs:
    "Do the bullets start with action verbs rather than 'responsible for' or noun phrases?",
  noFiller: "Is the writing free of filler like 'hard-working team player' or 'results-driven'?",
} as const
export type WritingAnswers = Partial<Record<keyof typeof writingQuestions, boolean>>

const writingAdvice: Record<keyof typeof writingQuestions, string> = {
  summaryStatesRole:
    "Say in the first lines what role you're after, in the words a posting would use.",
  resultsInBullets:
    "Give each experience bullet a number or an outcome: what changed because of you.",
  recentFirst: "Put your most recent role first and go back in time from there.",
  activeVerbs: "Start each bullet with a verb: built, led, cut, shipped.",
  noFiller: "Cut phrases like 'hard-working team player'; show it with a result instead.",
}

/** Advice from Jev's "no"s, then one line per tag the resume doesn't show. */
export const suggestionsFrom = (answers: WritingAnswers, shows: Review["shows"]): string[] => [
  ...(Object.keys(writingQuestions) as (keyof typeof writingQuestions)[])
    .filter((q) => answers[q] === false)
    .map((q) => writingAdvice[q]),
  ...shows
    .filter((s) => s.shown === "no")
    .map(
      (s) =>
        `Your Preferences list “${s.tag}”, but the resume doesn't show it. Add where you used it, or leave it off your Preferences.`
    ),
]

// Jev reads this much of the resume: the first two pages or so.
export const maxJevChars = 8000

// Tags Jev checks the resume against, from the top of each list.
export const maxTags = 12
