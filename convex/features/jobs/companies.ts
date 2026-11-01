import type { Id } from "../../_generated/dataModel"
import type { QueryCtx } from "../../_generated/server"
import { record, text } from "../workflows/sources/source"
import { isCompanyBoard } from "./boards"
import { openRoles } from "./counts"

export const researchEvery = 30 * 24 * 60 * 60 * 1000
export const researchBatch = 25

export const ycUrl = "https://yc-oss.github.io/api/companies/all.json"
// IANA's list of each suffix's registry. rdap.org would look this up for us, but cuts off after
// a few quick requests.
export const rdapRegistriesUrl = "https://data.iana.org/rdap/dns.json"

// The job boards' own hosts, which say nothing about who's hiring.
const boardHosts = new Set([
  "greenhouse.io",
  "lever.co",
  "ashbyhq.com",
  "personio.de",
  "personio.com",
  "workable.com",
  "smartrecruiters.com",
])

// ponytail: the last two labels, or three under a suffix like co.uk, not the public suffix list.
// Add one if a company on some rarer suffix shows up under the wrong domain.
export const domainOf = (url: string) => {
  if (!URL.canParse(url)) return null
  const host = new URL(url).hostname.toLowerCase()
  const labels = /\.(co|com|org|net|ac|gov|edu)\.[a-z]{2}$/.test(host) ? 3 : 2
  return host.split(".").slice(-labels).join(".") || null
}

/** The company's own site, when that's where most of a board's postings live. */
export const postingDomain = (urls: string[]) => {
  const seen = new Map<string, number>()
  for (const url of urls) {
    const domain = domainOf(url)
    if (domain) seen.set(domain, (seen.get(domain) ?? 0) + 1)
  }
  const top = [...seen].sort((a, b) => b[1] - a[1])[0]?.[0]
  return top && !boardHosts.has(top) ? top : null
}

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "")

// The whole name, never a word of it: "Open Energy Transition" isn't open.com. A miss only
// leaves a company unverified, and a wrong match would show someone else's evidence.
export const nameMatches = (company: string, domain: string) => {
  const name = squash(company.replace(/\b(inc|llc|ltd|gmbh|ag|corp|careers)\b/gi, ""))
  if (name.length < 3) return false
  return (
    squash(domain) === name ||
    new RegExp(`^(get|try|use|join)?${name}(hq|app|labs|inc)?$`).test(
      squash(domain.split(".")[0] ?? "")
    )
  )
}

/** The first search result on a domain carrying the company's name. */
export const searchedDomain = (company: string, urls: string[]) => {
  for (const url of urls) {
    const domain = domainOf(url)
    if (domain && !boardHosts.has(domain) && nameMatches(company, domain)) return domain
  }
  return null
}

const batches = /^(Winter|Spring|Summer|Fall) \d{4}$/

/** The community's YC list by website domain. Names aren't used: they can be copied. */
export const ycByDomain = (json: unknown) => {
  const found = new Map<string, { batch: string; status: string; url: string; teamSize?: number }>()
  for (const entry of Array.isArray(json) ? json : []) {
    const c = record(entry)
    const domain = domainOf(text(c.website))
    if (!domain || !batches.test(text(c.batch)) || c.status === "Not YC") continue
    found.set(domain, {
      batch: text(c.batch),
      status: text(c.status),
      url: text(c.url),
      ...(typeof c.team_size === "number" && { teamSize: c.team_size }),
    })
  }
  return found
}

/** Each suffix's RDAP address. Some have none (.co, .de, .io, .so), so those domains get no age. */
export const rdapRegistries = (json: unknown) => {
  const found = new Map<string, string>()
  const services = record(json).services
  for (const service of Array.isArray(services) ? services : []) {
    const [suffixes, urls] = Array.isArray(service) ? service : []
    const url = Array.isArray(urls) ? text(urls[0]) : ""
    if (!url.startsWith("https://") || !Array.isArray(suffixes)) continue
    for (const suffix of suffixes) found.set(text(suffix), url.replace(/\/?$/, "/"))
  }
  return found
}

/** When a domain was registered, from its RDAP record. */
export const registeredAtOf = (json: unknown) => {
  const events = record(json).events
  for (const entry of Array.isArray(events) ? events : []) {
    const event = record(entry)
    if (event.eventAction !== "registration") continue
    const at = Date.parse(text(event.eventDate))
    return Number.isFinite(at) ? at : null
  }
  return null
}

/** What's known of each role's company. How the board reached that site belongs to the board. Each
 * board is read once, and all the counts are one call, however many roles there are. */
export const evidenceOf = async (
  ctx: QueryCtx,
  jobs: { boardId: Id<"jobBoards">; company: string }[]
) => {
  const read = async (boardId: Id<"jobBoards">) => {
    const board = await ctx.db.get("jobBoards", boardId)
    const company = board?.companyId ? await ctx.db.get("companies", board.companyId) : null
    return { board, company }
  }
  const places = new Map<Id<"jobBoards">, ReturnType<typeof read>>()
  const found = await Promise.all(
    jobs.map(({ boardId }) => {
      const known = places.get(boardId) ?? read(boardId)
      places.set(boardId, known)
      return known
    })
  )
  const open = await openRoles(
    ctx,
    found.map(({ board, company }, i) => ({
      board,
      domain: company?.domain,
      company: jobs[i]!.company,
    }))
  )
  return found.map(({ board, company }, i) => ({
    boardId: board?._id ?? null,
    domain: company?.domain ?? null,
    link: board?.companyLink ?? null,
    yc: company?.yc ?? null,
    registeredAt: company?.registeredAt ?? null,
    open: open[i]!,
    pooled: board ? !isCompanyBoard(board.kind) : false,
  }))
}
