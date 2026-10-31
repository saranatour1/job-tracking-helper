import type { WorkMode } from "../preferences/validators"
import type { Criteria } from "./fit"

export const jevModel = "typesafe/jev-1.14"

export type Profile = {
  prompt?: string
  interests: string[]
  skills: string[]
  stretch: boolean
  place?: string
  avoid: string[]
  redFlagCompanies: string[]
  pay?: string
  visa?: string
  liked: string[]
  disliked: string[]
}

export type JudgedJob = {
  title: string
  company: string
  location: string
  remote: boolean
  text: string
}

const listed = (items: string[]) => items.slice(0, 6).join(", ")

export const placeOf = (c: Criteria, workMode: WorkMode) => {
  const near = c.places.length ? ` in or near ${listed(c.places)}` : ""
  if (c.remoteOnly || workMode === "remote") return "Remote"
  if (c.nearMe && near) return `In or near ${listed(c.places)}`
  if (workMode === "hybrid") return `Hybrid${near}`
  if (workMode === "onsite") return `On-site${near}`
  return near ? `Remote, or${near}` : undefined
}

export const profileOf = (
  c: Criteria,
  more: {
    prompt?: string
    workMode: WorkMode
    pay?: string
    visa?: string
    liked: string[]
    disliked: string[]
  }
): Profile => ({
  ...(more.prompt && { prompt: more.prompt }),
  interests: c.usePreferences ? c.interests : [],
  skills: c.stretch ? c.skills : [],
  stretch: c.stretch,
  ...(placeOf(c, more.workMode) && { place: placeOf(c, more.workMode) }),
  avoid: c.skipRedFlags ? c.avoid : [],
  redFlagCompanies: c.skipRedFlags ? c.redFlagCompanies : [],
  ...(more.pay && { pay: more.pay }),
  ...(more.visa && { visa: more.visa }),
  liked: more.liked,
  disliked: more.disliked,
})

export const matchLevels = [
  "Unrelated: a different field or kind of work than they want",
  "Same broad field, but the wrong kind of role or the wrong level for them",
  "A reasonable match: the kind of work they want, with some gaps",
  "A strong match: the kind of work they described, at a level they'd take",
] as const

const matchReasons = [
  "Not the kind of work you want.",
  "The right field, but the wrong role or level for you.",
  "A reasonable match for what you want.",
  "A strong match for what you want.",
]

export const fitFrom = 1.8

type Spec = { kind: "want" | "need" | "avoid"; label: string; ask: string; must?: boolean }

export const specsOf = (p: Profile): Spec[] => [
  ...(p.place
    ? [
        {
          kind: "need" as const,
          label: p.place,
          must: true,
          ask: "Could `person` work `job` the way `person.wantsToWork` says? A remote role counts when it's open to people living where they are.",
        },
      ]
    : []),
  ...p.interests.slice(0, 4).map((i) => ({
    kind: "want" as const,
    label: i,
    ask: `Is \`job\` about, or in the field of, "${i}"?`,
  })),
  ...p.skills.slice(0, 2).map((s) => ({
    kind: "want" as const,
    label: `Uses ${s}`,
    ask: `Does \`job\` use or build the skill "${s}"?`,
  })),
  ...p.avoid.slice(0, 4).map((a) => ({
    kind: "avoid" as const,
    label: a,
    ask: `Does \`job\` involve "${a}", or come from a company known for it?`,
  })),
  ...(p.pay
    ? [
        {
          kind: "need" as const,
          label: "Pays what you need",
          ask: "Does the pay for `job` meet what `person.pay` says they need?",
        },
      ]
    : []),
  ...(p.visa
    ? [
        {
          kind: "need" as const,
          label: "Works with your visa situation",
          ask: "Given `person.visa`, could they take `job`? It holds when the role offers sponsorship, or when none is needed where the job is.",
        },
      ]
    : []),
]

const outcomes = {
  holds: "The posting shows this clearly holds",
  fails: "The posting shows this doesn't hold",
  unclear: "The posting doesn't say, or it only partly holds",
}
export type Outcome = keyof typeof outcomes

export const stateOf = (p: Profile, job: JudgedJob) => ({
  person: {
    ...(p.prompt && { wants: p.prompt }),
    drawnTo: p.interests,
    skills: p.skills,
    ...(p.stretch && { openToOneLevelUp: true }),
    ...(p.place && { wantsToWork: p.place }),
    avoid: p.avoid,
    ...(p.pay && { pay: p.pay }),
    ...(p.visa && { visa: p.visa }),
    ...(p.liked.length > 0 && { likedRoles: p.liked }),
    ...(p.disliked.length > 0 && { dislikedRoles: p.disliked }),
  },
  job: {
    title: job.title,
    company: job.company,
    location: job.location,
    remote: job.remote,
    posting: job.text,
  },
})

export const questionsOf = (p: Profile) => ({
  match: {
    type: "score" as const,
    instructions:
      "How well does `job` match the work `person` is looking for? `person.wants` is their own description of it, when present; `person.drawnTo` lists fields and kinds of work they want; `person.skills` are skills they have or are building. When `person.openToOneLevelUp` is true, a role one level more senior than their skills suggest still matches. `person.likedRoles` and `person.dislikedRoles` are roles they rated before: a role like the liked ones matches better, and one like the disliked ones matches worse.",
    criteria: [...matchLevels],
  },
  ...Object.fromEntries(
    specsOf(p).map((s, i) => [
      `c${i}`,
      { type: "choice" as const, instructions: s.ask, criteria: outcomes },
    ])
  ),
})

export type Check = {
  kind: "want" | "need" | "avoid"
  label: string
  result: "fits" | "maybe" | "notFit"
  confidence: number
  must?: boolean
}

export const checksOf = (
  p: Profile,
  job: Pick<JudgedJob, "company">,
  answers: { outcome: Outcome; confidence: number }[]
): Check[] => {
  const checks = specsOf(p).flatMap((s, i): Check[] => {
    const a = answers[i]
    if (!a) return []
    const { confidence } = a
    const must = s.must ? { must: true } : {}
    if (s.kind === "avoid") {
      if (a.outcome === "holds")
        return [{ kind: s.kind, label: `Involves ${s.label}`, result: "notFit", confidence }]
      if (a.outcome === "fails")
        return [{ kind: s.kind, label: `No ${s.label}`, result: "fits", confidence }]
      return [{ kind: s.kind, label: `Might involve ${s.label}`, result: "maybe", confidence }]
    }
    if (s.kind === "want" && a.outcome === "fails") return []
    const result = a.outcome === "holds" ? "fits" : a.outcome === "fails" ? "notFit" : "maybe"
    return [{ kind: s.kind, label: s.label, result, confidence, ...must }]
  })
  const company = job.company.toLowerCase()
  const flagged = p.redFlagCompanies.find((c) => company.includes(c.toLowerCase()))
  if (flagged)
    checks.push({
      kind: "avoid",
      label: `At ${job.company}, on your red-flag list`,
      result: "notFit",
      confidence: 1,
    })
  return checks
}

export type Verdict = {
  verdict: "fit" | "notFit"
  fit: number
  reasons: string[]
  checks: Check[]
  judgment: { match: number; level: string; model: string }
}

export const verdictOf = (match: number, checks: Check[], model: string): Verdict => {
  const nearest = Math.round(Math.min(Math.max(match, 0), 3))
  const reasons = [matchReasons[nearest]]
  const misses = checks.filter((c) => c.kind !== "want" && c.result === "notFit")
  const unconfirmed = checks.filter((c) => c.must && c.result === "maybe")
  if (misses.length) reasons.push(`It misses: ${misses.map((c) => c.label).join(", ")}.`)
  if (unconfirmed.length)
    reasons.push(`The posting doesn't confirm: ${unconfirmed.map((c) => c.label).join(", ")}.`)
  return {
    verdict: match >= fitFrom && !misses.length && !unconfirmed.length ? "fit" : "notFit",
    fit: Math.round((match / 3) * 100),
    reasons,
    checks,
    judgment: { match, level: matchLevels[nearest], model },
  }
}
