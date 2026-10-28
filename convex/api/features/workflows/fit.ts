import type { LoopAnswers } from "../loops/catalog"
import type { TagKind } from "../preferences/rows"

// How a run decides what to search for and whether a posting fits. Rules only: words
// from the person's Preferences, matched against the posting's text.

export type Criteria = LoopAnswers & {
  interests: string[]
  skills: string[]
  places: string[]
  companies: string[]
  avoid: string[]
}

export const criteriaOf = (
  answers: LoopAnswers,
  tags: { kind: TagKind; value: string }[]
): Criteria => {
  const of = (...kinds: TagKind[]) => tags.filter((t) => kinds.includes(t.kind)).map((t) => t.value)
  return {
    ...answers,
    interests: of("interest"),
    skills: of("skill"),
    places: of("location"),
    companies: of("company"),
    avoid: of("avoid", "redFlagCompany"),
  }
}

// Up to three searches. Each names the kind of work and, when asked, where.
export const queriesOf = (c: Criteria): string[] => {
  if (c.listedCompanies && c.companies.length)
    return c.companies.slice(0, 3).map((company) => `${company} careers open roles`)
  const where = c.remoteOnly ? "remote" : c.nearMe && c.places[0] ? c.places[0] : ""
  const topics = [...(c.usePreferences ? c.interests : []), ...(c.stretch ? c.skills : [])].slice(
    0,
    3
  )
  return (topics.length ? topics : ["software"]).map((topic) => `${topic} jobs ${where}`.trim())
}

export type Posting = { url: string; title: string; snippet: string; text?: string }
export type Fit = { fit: number; reasons: string[] } | { rejected: string }

// A posting fits when nothing rules it out; matches then raise its score.
export const keepFrom = 45

export const score = (c: Criteria, p: Posting): Fit => {
  const text = `${p.title}\n${p.snippet}\n${p.text ?? ""}`.toLowerCase()
  const has = (word: string) => text.includes(word.toLowerCase())
  if (c.skipRedFlags) {
    const flag = c.avoid.find(has)
    if (flag) return { rejected: `Mentions ${flag}` }
  }
  if (c.remoteOnly && !has("remote")) return { rejected: "Not remote" }
  if (c.listedCompanies && c.companies.length && !c.companies.some(has))
    return { rejected: "Not one of your companies" }

  let fit = 30
  const reasons: string[] = []
  const matched = (words: string[], each: number, cap: number, why: (w: string) => string) => {
    const found = words.filter(has)
    fit += Math.min(found.length * each, cap)
    reasons.push(...found.slice(0, 2).map(why))
  }
  if (c.usePreferences) matched(c.interests, 15, 45, (w) => `Mentions ${w}`)
  if (c.nearMe) matched(c.places, 15, 15, (w) => `In ${w}`)
  if (c.stretch) matched(c.skills, 10, 20, (w) => `Uses ${w}`)
  if (c.listedCompanies) matched(c.companies, 20, 20, (w) => `At ${w}`)
  if (c.remoteOnly) {
    fit += 10
    reasons.push("Remote")
  }
  if (/\b(apply|responsibilities|requirements|qualifications)\b/.test(text)) fit += 5
  return { fit: Math.min(fit, 100), reasons: reasons.slice(0, 5) }
}

// The same posting can come back with tracking parameters or a trailing slash; this is
// the key that treats those as one.
export const urlKey = (url: string) => {
  const u = new URL(url)
  const tracking = [...u.searchParams.keys()].filter(
    (key) => key.startsWith("utm_") || ["ref", "source", "src", "gclid", "fbclid"].includes(key)
  )
  for (const key of tracking) u.searchParams.delete(key)
  u.searchParams.sort()
  const host = u.hostname.toLowerCase().replace(/^www\./, "")
  const path = u.pathname.replace(/\/+$/, "")
  const query = u.searchParams.toString()
  return `${host}${path}${query ? `?${query}` : ""}`
}

// Job boards put the company in the path; elsewhere the site's name is the best guess.
export const companyFromUrl = (url: string) => {
  const u = new URL(url)
  const host = u.hostname.toLowerCase().replace(/^www\./, "")
  const first = u.pathname.split("/").filter(Boolean)[0]
  if (first && /(greenhouse\.io|lever\.co|ashbyhq\.com|workable\.com)$/.test(host))
    return first.replace(/[-_]/g, " ")
  const name = host.split(".").at(-2) ?? host
  return name.charAt(0).toUpperCase() + name.slice(1)
}
