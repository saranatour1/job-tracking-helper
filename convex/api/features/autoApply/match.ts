// Matches an application form's fields to the person's saved answers. Plain labels are
// matched here by synonym; what's left goes to Jev as a choice between saved answers,
// never as text to write. Kept free of convex/server imports so tests stay plain.

/** A field as the form reader describes it. */
export type FormField = {
  selector: string
  name: string
  // input types, plus "select", "textarea" and "custom" (a click-to-pick dropdown).
  type: string
  label: string
  required: boolean
  options?: string[]
}

/** A saved answer: a Prefilled field, a custom question, or an account detail. */
export type Answer = { key: string; label: string; value: string }

export type Fill = { selector: string; value: string; key: string }

// Demographic and EEO questions are never answered.
export const demographic =
  /\b(gender|race|ethnic|veteran|disabilit|hispanic|latino|sexual orientation|transgender|religion)\b/i

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
  /\b(location|city|where are you based|current location|country of residence)\b/i,
  /\b(authori[sz]ed to work|work authori[sz]ation|right to work|legally able to work)\b/i,
  /\b(visa|sponsorship)\b/i,
  /\b(salary|compensation|pay expectation|expected pay)\b/i,
  /\b(start date|earliest start|available to start|notice period|availability)\b/i,
  /\bpronouns?\b/i,
]

const groupOf = (label: string) => groups.findIndex((re) => re.test(label.trim()))

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
    const label = `${f.label} ${f.name}`.trim()
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
    const derived =
      !saved && fullName && g === 1
        ? nameParts(fullName.value).first
        : !saved && fullName && g === 2
          ? nameParts(fullName.value).last
          : undefined
    const value = saved?.value ?? derived
    if (value !== undefined && f.type !== "select" && f.type !== "custom" && f.type !== "radio") {
      plan.fills.push({ selector: f.selector, value, key: saved?.key ?? fullName!.key })
      continue
    }
    // A pick list with a saved answer still needs the matching option: Jev's call.
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
