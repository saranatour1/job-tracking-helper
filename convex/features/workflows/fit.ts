import type { LoopAnswers } from "../loops/catalog"
import type { TagKind } from "../preferences/rows"

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

export const jobBoards = [
  "boards.greenhouse.io",
  "job-boards.greenhouse.io",
  "jobs.lever.co",
  "jobs.ashbyhq.com",
  "jobs.personio.de",
  "jobs.personio.com",
  "apply.workable.com",
  "jobs.smartrecruiters.com",
]

export const isPostingUrl = (url: string) => {
  if (!URL.canParse(url)) return false
  const u = new URL(url)
  const host = u.hostname.toLowerCase()
  const parts = u.pathname.split("/").filter(Boolean)
  if (host === "boards.greenhouse.io" || host === "job-boards.greenhouse.io")
    return parts[1] === "jobs" && Boolean(parts[2])
  if (host === "jobs.lever.co" || host === "jobs.ashbyhq.com") return parts.length >= 2
  if (host === "apply.workable.com") return parts[1] === "j" && Boolean(parts[2])
  if (host === "jobs.smartrecruiters.com")
    return parts.length === 2 && !["ni", "oneclick-ui"].includes(parts[0]?.toLowerCase() ?? "")
  if (/\.jobs\.personio\.(de|com)$/.test(host)) return parts[0] === "job" && Boolean(parts[1])
  return false
}

export const descriptionsOf = (prompt: string | undefined) =>
  (prompt ?? "")
    .split(/\n|;/)
    .map((d) => d.trim())
    .filter(Boolean)
    .slice(0, 4)

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
  // With no topic, a place alone still finds something, and Jev judges it.
  return (topics.length ? topics : [""])
    .flatMap((topic) => wheres.map((where) => `${topic} ${where}`.trim()))
    .filter(Boolean)
    .slice(0, 8)
}

// For the Arbeitsagentur, which takes what and where apart and searches around a place. Only
// for loops in your places, since it's German roles and a nationwide search helps nobody.
export const localSearchesOf = (c: Criteria, descriptions: string[] = []) => {
  if (c.listedCompanies || c.remoteOnly || !c.nearMe) return []
  const topics = [
    ...new Set([
      ...descriptions,
      ...(c.usePreferences ? c.interests : []),
      ...(c.stretch ? c.skills : []),
    ]),
  ].slice(0, 4)
  return topics
    .flatMap((what) => c.places.slice(0, 4).map((where) => ({ what, where })))
    .slice(0, 8)
}

export type Posting = { url: string; title: string; snippet: string }

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
