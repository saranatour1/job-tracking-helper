import type { LoopAnswers } from "../loops/catalog"
import type { TagKind } from "../preferences/rows"

// How a run decides what to search for: words from the person's Preferences. Whether a
// role fits is Jev's call, in judge.ts.

export type Criteria = LoopAnswers & {
  interests: string[]
  skills: string[]
  places: string[]
  companies: string[]
  avoid: string[]
  redFlagCompanies: string[]
}

export const criteriaOf = (
  answers: LoopAnswers,
  tags: { kind: TagKind; value: string }[]
): Criteria => {
  const of = (...kinds: TagKind[]) => tags.filter((t) => kinds.includes(t.kind)).map((t) => t.value)
  // Picked one by one, so a field a loop no longer uses never reaches the run.
  return {
    usePreferences: answers.usePreferences,
    stretch: answers.stretch,
    remoteOnly: answers.remoteOnly,
    nearMe: answers.nearMe,
    listedCompanies: answers.listedCompanies,
    skipRedFlags: answers.skipRedFlags,
    postedToday: answers.postedToday,
    interests: of("interest"),
    skills: of("skill"),
    places: of("location"),
    companies: of("company"),
    avoid: of("avoid"),
    redFlagCompanies: of("redFlagCompany"),
  }
}

// Job boards whose pages are one posting each. Searches only look here, so a run reads
// postings instead of job-board front pages, lists and articles.
export const jobBoards = [
  "boards.greenhouse.io",
  "job-boards.greenhouse.io",
  "jobs.lever.co",
  "jobs.ashbyhq.com",
  "jobs.personio.de",
  "jobs.personio.com",
  "apply.workable.com",
]

// One posting's URL on a job board, not the board's or a company's front page.
export const isPostingUrl = (url: string) => {
  if (!URL.canParse(url)) return false
  const u = new URL(url)
  const host = u.hostname.toLowerCase()
  const parts = u.pathname.split("/").filter(Boolean)
  if (host === "boards.greenhouse.io" || host === "job-boards.greenhouse.io")
    return parts[1] === "jobs" && Boolean(parts[2])
  if (host === "jobs.lever.co" || host === "jobs.ashbyhq.com") return parts.length >= 2
  if (host === "apply.workable.com") return parts[1] === "j" && Boolean(parts[2])
  if (/\.jobs\.personio\.(de|com)$/.test(host)) return parts[0] === "job" && Boolean(parts[1])
  return false
}

// The kinds of role someone described in their own words, one per line (or separated
// by semicolons), so one loop can look for several at once.
export const descriptionsOf = (prompt: string | undefined) =>
  (prompt ?? "")
    .split(/\n|;/)
    .map((d) => d.trim())
    .filter(Boolean)
    .slice(0, 4)

// Up to eight searches: each kind of role they want, in each place they'd work, so one
// loop covers Berlin, Munich and Hamburg at once. For listed companies, just the company.
export const queriesOf = (c: Criteria, descriptions: string[] = []): string[] => {
  if (c.listedCompanies && c.companies.length) return c.companies.slice(0, 4)
  const wheres = c.remoteOnly
    ? ["remote"]
    : c.nearMe && c.places.length
      ? c.places.slice(0, 4)
      : [""]
  const topics = [
    ...new Set([
      ...descriptions,
      ...(c.usePreferences ? c.interests : []),
      ...(c.stretch ? c.skills : []),
    ]),
  ].slice(0, 4)
  return (topics.length ? topics : ["software engineer"])
    .flatMap((topic) => wheres.map((where) => `${topic} ${where}`.trim()))
    .slice(0, 8)
}

export type Posting = { url: string; title: string; snippet: string }

// The same posting can come back with tracking parameters, a language, a trailing
// slash, its apply page or Greenhouse's older host; this is the key that treats those
// as one.
export const urlKey = (url: string) => {
  const u = new URL(url)
  const tracking = [...u.searchParams.keys()].filter(
    (key) =>
      key.startsWith("utm_") ||
      ["ref", "source", "src", "gclid", "fbclid", "language"].includes(key)
  )
  for (const key of tracking) u.searchParams.delete(key)
  u.searchParams.sort()
  const host = u.hostname
    .toLowerCase()
    .replace(/^www\./, "")
    .replace(/^boards\.greenhouse\.io$/, "job-boards.greenhouse.io")
  const path = u.pathname.replace(/\/+$/, "").replace(/\/(apply|application)$/, "")
  const query = u.searchParams.toString()
  return `${host}${path}${query ? `?${query}` : ""}`
}
