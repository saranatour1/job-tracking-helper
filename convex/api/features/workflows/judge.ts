import type { Criteria } from "./fit"

// How Jev decides whether a role fits someone. Jev answers typed questions about the
// person and the role; the rules for what counts as a fit stay here in code.

export const jevModel = "typesafe/jev-1.14"

export type Profile = Criteria & { prompt?: string }
export type JudgedJob = {
  title: string
  company: string
  location: string
  remote: boolean
  text: string
}

// The match levels Jev picks between, worst first. Its answer is a weighted position on
// this scale, 0 to 3.
export const matchLevels = [
  "Unrelated: a different field or kind of work than they want",
  "Same broad field, but the wrong kind of role or the wrong level for them",
  "A reasonable match: the kind of work they want, with some gaps",
  "A strong match: the kind of work they described, at a level they'd take",
] as const

// The same levels as a person reads them, in the verdict's reasons.
const matchReasons = [
  "Not the kind of work you want.",
  "The right field, but the wrong role or level for you.",
  "A reasonable match for what you want.",
  "A strong match for what you want.",
]

// A role is a fit from this match upward (2 is "a reasonable match").
export const fitFrom = 1.8

export const stateOf = (p: Profile, job: JudgedJob) => ({
  person: {
    ...(p.prompt && { wants: p.prompt }),
    drawnTo: p.usePreferences ? p.interests : [],
    skills: p.skills,
    ...(p.stretch && { openToOneLevelUp: true }),
    places: p.places,
    avoid: p.avoid,
  },
  job: {
    title: job.title,
    company: job.company,
    location: job.location,
    remote: job.remote,
    posting: job.text,
  },
})

// One request per role, with the questions this loop needs asked together.
export const questionsOf = (p: Profile) => ({
  match: {
    type: "score" as const,
    instructions:
      "How well does `job` match the work `person` is looking for? `person.wants` is their own description of it, when present; `person.drawnTo` lists fields and kinds of work they want; `person.skills` are skills they have or are building. When `person.openToOneLevelUp` is true, a role one level more senior than their skills suggest still matches.",
    criteria: [...matchLevels],
  },
  ...(p.skipRedFlags &&
    p.avoid.length > 0 && {
      avoids: {
        type: "boolean" as const,
        instructions:
          "Does `job` involve, or come from a company known for, anything listed in `person.avoid`?",
      },
    }),
  ...(p.nearMe &&
    p.places.length > 0 && {
      inPlace: {
        type: "boolean" as const,
        instructions:
          "Could `person` do `job` from one of `person.places`? Count it as yes when the role is in or near one of them, or remote and open to people living there.",
      },
    }),
})

// What a run saves for each judged role: a verdict, the reasons in words, and Jev's raw
// answers, so a person can read why and an agent can filter on the numbers.
export type Answers = { match: number; avoids?: number; inPlace?: number }
export type Verdict = {
  verdict: "fit" | "notFit"
  fit: number
  reasons: string[]
  judgment: Answers & { level: string; model: string }
}

export const verdictOf = (a: Answers, job: Pick<JudgedJob, "remote">, model: string): Verdict => {
  const nearest = Math.round(Math.min(Math.max(a.match, 0), 3))
  const level = matchLevels[nearest]
  const reasons = [matchReasons[nearest]]
  const avoided = a.avoids !== undefined && a.avoids >= 0.5
  const away = a.inPlace !== undefined && a.inPlace < 0.5
  if (avoided) reasons.push("It touches something you said you'd avoid.")
  if (away) reasons.push("It isn't in or near your places.")
  if (a.inPlace !== undefined && !away) reasons.push("You can do it from one of your places.")
  if (job.remote) reasons.push("It's remote.")
  return {
    verdict: a.match >= fitFrom && !avoided && !away ? "fit" : "notFit",
    fit: Math.round((a.match / 3) * 100),
    reasons,
    judgment: { ...a, level, model },
  }
}
