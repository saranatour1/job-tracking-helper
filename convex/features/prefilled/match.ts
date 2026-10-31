import { maxFields, maxOptions, type PrefillField } from "./validators"

// Matches an application form's fields to the person's saved answers. Plain labels are
// matched here by synonym; what's left goes to Jev as a choice between saved answers,
// never as text to write. Kept free of convex/server imports so tests stay plain.

/** A field as the form reader describes it. */
export type FormField = {
  selector: string
  name: string
  // input types, plus "select", "textarea", "custom" (a click-to-pick dropdown) and
  // "yesno" (Ashby's pair of buttons).
  type: string
  label: string
  required: boolean
  options?: string[]
}

/** A saved answer: a Prefilled field, a custom question, or an account detail. */
export type Answer = { key: string; label: string; value: string }

export type Fill = {
  selector: string
  value: string
  key: string
  // What to try if a pick list doesn't have `value`: some "Location" lists hold countries.
  fallback?: string
}

// Demographic and EEO questions are never answered.
export const demographic =
  /\b(gender|race|ethnic\w*|veteran\w*|disabilit\w*|hispanic|latino|sexual orientation|transgender|religion|eeoc?)\b/i

// Boxes that stand for reading a privacy notice or confirming the answers are true.
const consent = /\b(agree|consent|privacy|terms|certify|acknowledge|confirm that)\b/i

const resumeField = /\b(resume|résumé|cv|curriculum)\b/i
const coverLetter = /cover letter/i

// Each group: the words a form or a saved answer might use for the same thing.
const groups: RegExp[] = [
  /\b(full name|your name|^name$|legal name)\b/i,
  /\bfirst name\b|\bgiven name\b/i,
  /\blast name\b|\bsurname\b|\bfamily name\b/i,
  /\be-?mail\b/i,
  /\b(phone|mobile|telephone)\b/i,
  /\blinkedin\b/i,
  /\bgithub\b/i,
  /\b(website|portfolio|personal site|homepage)\b/i,
  /\b(authori[sz]ed to work|work authori[sz]ation|right to work|(legally able|eligible) to work)\b/i,
  /\b(visa|sponsorship)\b/i,
  // After those: "authorized to work in the country" is a yes-or-no, not a country.
  /\bpreferred (work )?locations?\b/i,
  /\bcountry\b/i,
  /\b(location|city|town|where are you based)\b/i,
  /\b(salary|compensation|pay expectation|expected pay)\b/i,
  /\b(start date|earliest start|available to start|notice period|availability)\b/i,
  /\bpronouns?\b/i,
]

const countryGroup = groups.findIndex((re) => re.test("country"))
const locationGroup = groups.findIndex((re) => re.test("location"))

const groupOf = (label: string) => groups.findIndex((re) => re.test(label.trim()))

/** A fact about the person (name, phone, visa, salary…) that only they can state. */
export const isPersonalFact = (label: string) => groupOf(label) >= 0

const nameParts = (full: string) => {
  const parts = full.trim().split(/\s+/)
  return { first: parts[0] ?? "", last: parts.slice(1).join(" ") }
}

export type Plan = {
  fills: Fill[]
  // The file input the resume goes in, if the form has one.
  upload?: string
  // Consent boxes to tick.
  consent: string[]
  // Fields nothing matched by synonym, for Jev to pick a saved answer or an option for.
  ask: FormField[]
  // Fields left blank on purpose.
  skipped: string[]
}

/** Matches by synonym. Jev gets the rest. */
export const planFor = (fields: FormField[], answers: Answer[]): Plan => {
  const byGroup = new Map<number, Answer>()
  for (const a of answers) {
    const g = groupOf(a.label)
    if (g >= 0 && a.value.trim() && !byGroup.has(g)) byGroup.set(g, a)
  }
  const fullName = byGroup.get(0)
  const plan: Plan = { fills: [], consent: [], ask: [], skipped: [] }
  for (const f of fields) {
    // Names like cover_letter and _systemfield_resume read as words this way.
    const label = `${f.label} ${f.name}`.replace(/_/g, " ").trim()
    if (f.type === "file") {
      if (resumeField.test(label) && !plan.upload) plan.upload = f.selector
      else plan.skipped.push(f.label || f.name)
      continue
    }
    if (demographic.test(label) && !/pronoun/i.test(label)) {
      plan.skipped.push(f.label || f.name)
      continue
    }
    if (f.type === "checkbox" && consent.test(label)) {
      plan.consent.push(f.selector)
      continue
    }
    if (f.type === "hidden" || f.type === "submit" || f.type === "button") continue
    // A pick list's own search box, not a question.
    if (/^search$/i.test(f.label.trim())) continue
    if (coverLetter.test(label)) {
      plan.skipped.push(f.label || f.name)
      continue
    }
    const g = groupOf(label)
    const saved = g >= 0 ? byGroup.get(g) : undefined
    // First and last name come from a full name when nothing was saved for them.
    // A one-word full name has no last name to give: that's a question, not a blank.
    const derived =
      !saved && fullName && g === 1
        ? nameParts(fullName.value).first
        : !saved && fullName && g === 2
          ? nameParts(fullName.value).last
          : undefined
    const value = saved?.value ?? (derived || undefined)
    const listed = f.options?.find((o) => o.toLowerCase() === value?.trim().toLowerCase())
    if (value !== undefined && (listed || !f.options?.length)) {
      const country = byGroup.get(countryGroup)
      plan.fills.push({
        selector: f.selector,
        value: listed ?? value,
        key: saved?.key ?? fullName!.key,
        ...(f.type === "custom" && g === locationGroup && country && { fallback: country.value }),
      })
      continue
    }
    // A pick list whose options don't include the saved answer word for word: Jev's call.
    plan.ask.push(f)
  }
  return plan
}

/** Jev's questions for the fields synonyms didn't settle: for a pick list, which option
 * matches the person's answers; for anything else, which saved answer fits. */
export const questionsFor = (ask: FormField[], answers: Answer[]) =>
  Object.fromEntries(
    ask.map((f, i) => {
      const options = f.options?.length ? f.options : undefined
      const criteria = options
        ? Object.fromEntries(options.map((o, j) => [`o${j}`, o]))
        : Object.fromEntries(answers.map((a) => [a.key, `${a.label}: ${a.value.slice(0, 160)}`]))
      return [
        `q${i}`,
        {
          type: "choice" as const,
          instructions: options
            ? `The form asks “${f.label}”. Which option is right for this person, going by their saved answers in \`answers\`? Pick none if none clearly is.`
            : `The form asks “${f.label}”. Which saved answer in \`answers\` answers it? Pick none if none does; never guess.`,
          criteria: { ...criteria, none: "None of these answers this question" },
        },
      ]
    })
  )

type Fields = PrefillField[]

/** What a prepared application keeps: every question left to answer, and its answer so far. */
export const prefillFieldsFrom = (
  fields: FormField[],
  plan: Plan,
  resolved: { fills: Fill[] }
): Fields => {
  const filled = new Map<string, Fill & { source: "saved" | "jev" }>([
    ...plan.fills.map((f) => [f.selector, { ...f, source: "saved" as const }] as const),
    ...resolved.fills.map((f) => [f.selector, { ...f, source: "jev" as const }] as const),
  ])
  const asked = new Set(plan.ask.map((f) => f.selector))
  return fields
    .filter((f) => filled.has(f.selector) || asked.has(f.selector))
    .slice(0, maxFields)
    .map((f) => {
      const fill = filled.get(f.selector)
      const options = f.options?.length && f.options.length <= maxOptions ? f.options : undefined
      return {
        question: f.label || f.name,
        type: f.type,
        required: f.required,
        ...(options && { options }),
        source: fill?.source ?? "none",
        ...(fill && { answer: fill.value }),
        ...(fill && fill.key !== "option" && { entryKey: fill.key }),
        ...(fill?.fallback && { fallback: fill.fallback }),
      }
    })
}

// An AI draft needs you too, until you've read it and pressed Save.
export const statusFrom = (fields: Fields) =>
  fields.some((f) => f.required && (!f.answer || f.source === "ai"))
    ? ("needsAnswers" as const)
    : ("ready" as const)

/** Lines a prepared application's answers up with the form as it reads right now. A
 * question the form no longer asks, or doesn't find, goes on the list to do by hand.
 * `spots` says where each question is, so one can be sent to the open browser later. */
export const liveFillsFrom = (fields: FormField[], saved: Fields) => {
  const left = [...fields]
  const fills: (Fill & { type: string; label: string })[] = []
  const unfilled: string[] = []
  const spots: { question: string; selector: string }[] = []
  for (const s of saved) {
    const at = left.findIndex((f) => (f.label || f.name) === s.question)
    const [f] = at < 0 ? [] : left.splice(at, 1)
    if (f) spots.push({ question: s.question, selector: f.selector })
    if (!s.answer) {
      if (s.required) unfilled.push(s.question)
      continue
    }
    if (!f) {
      unfilled.push(s.question)
      continue
    }
    fills.push({
      selector: f.selector,
      value: s.answer,
      key: s.entryKey ?? "you",
      type: f.type,
      label: s.question,
      ...(s.fallback && { fallback: s.fallback }),
    })
  }
  return { fills, unfilled, spots }
}

/** Turns Jev's picks into fills, and lists what stays unanswered. */
export const resolve = (
  ask: FormField[],
  answers: Answer[],
  picks: Record<string, string | undefined>
): { fills: Fill[]; missing: { question: string; required: boolean }[] } => {
  const fills: Fill[] = []
  const missing: { question: string; required: boolean }[] = []
  ask.forEach((f, i) => {
    const pick = picks[`q${i}`]
    const option = pick?.startsWith("o") && f.options ? f.options[Number(pick.slice(1))] : undefined
    const answer = answers.find((a) => a.key === pick)
    if (option !== undefined) fills.push({ selector: f.selector, value: option, key: "option" })
    else if (answer) fills.push({ selector: f.selector, value: answer.value, key: answer.key })
    else {
      // A form can render the same question twice (a pick list and its hidden twin).
      const question = f.label || f.name
      const seen = missing.find((m) => m.question === question)
      if (seen) seen.required ||= f.required
      else missing.push({ question, required: f.required })
    }
  })
  return { fills, missing }
}
