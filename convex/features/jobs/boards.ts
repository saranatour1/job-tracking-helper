import { markdownOf } from "../../lib/markdown"

export const boardKinds = [
  "greenhouse",
  "lever",
  "ashby",
  "personio",
  "smartrecruiters",
  "workable",
  "arbeitsagentur",
  "remoteok",
  "hackernews",
] as const
export type BoardKind = (typeof boardKinds)[number]

export type FeedJob = {
  url: string
  title: string
  company: string
  location: string
  remote: boolean
  postedAt: number
  text: string
}

export const maxText = 3500

const smartRecruiters = "https://api.smartrecruiters.com/v1/companies"
const arbeitsagentur = "https://rest.arbeitsagentur.de/jobboerse/jobsuche-service"
const hackerNews = "https://hn.algolia.com/api/v1"

// An Arbeitsagentur board is one saved search, not one company, since it holds about a million
// roles: "what|where", in lowercase. The rest of a board's life is the same as any other.
export const searchSlug = (what: string, where: string) =>
  [what, where].map((w) => w.replace(/\|/g, " ").trim().toLowerCase().slice(0, 80)).join("|")
const searchOf = (slug: string) => {
  const [what = "", where = ""] = slug.split("|")
  return { what, where }
}

export const feedUrl = (kind: BoardKind, slug: string) => {
  const safe = encodeURIComponent(slug)
  if (kind === "greenhouse")
    return `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=true`
  if (kind === "lever") return `https://api.lever.co/v0/postings/${slug}?mode=json`
  if (kind === "ashby") return `https://api.ashbyhq.com/posting-api/job-board/${slug}`
  if (kind === "personio") return `https://${slug}.jobs.personio.de/xml?language=en`
  // ponytail: the newest 100 of a company's roles, so Bosch's 5,000 don't take a fetch's
  // requests. Page through `offset` if people miss older ones.
  if (kind === "smartrecruiters") return `${smartRecruiters}/${safe}/postings?limit=100`
  if (kind === "workable")
    return `https://apply.workable.com/api/v1/widget/accounts/${safe}?details=true`
  if (kind === "remoteok") return "https://remoteok.com/api"
  if (kind === "hackernews")
    return `${hackerNews}/search_by_date?tags=story,author_whoishiring&query=%22who%20is%20hiring%22&hitsPerPage=1`
  const { what, where } = searchOf(slug)
  return `${arbeitsagentur}/pc/v6/jobs?${new URLSearchParams({ was: what, wo: where, size: "50" })}`
}

// The Arbeitsagentur's public client id, from its API docs. It isn't a secret.
export const feedHeaders = (kind: BoardKind): Record<string, string> =>
  kind === "arbeitsagentur" ? { "X-API-Key": "jobboerse-jobsuche" } : {}

// These feeds list roles without their text, so each role takes one more request.
export const detailUrls = (kind: BoardKind, slug: string, json: unknown) => {
  const body = json && typeof json === "object" ? (json as Record<string, unknown>) : {}
  if (kind === "smartrecruiters")
    return list(body.content).map((j) => ({
      id: str(j.id),
      url: `${smartRecruiters}/${encodeURIComponent(slug)}/postings/${encodeURIComponent(str(j.id))}`,
    }))
  if (kind === "hackernews")
    return list(body.hits)
      .slice(0, 1)
      .map((h) => ({ id: str(h.objectID), url: `${hackerNews}/items/${str(h.objectID)}` }))
  if (kind === "arbeitsagentur" && placeMatches(slug, body))
    return list(body.ergebnisliste).map((j) => ({
      id: str(j.referenznummer),
      url: `${arbeitsagentur}/pc/v4/jobdetails/${encodeURIComponent(btoa(str(j.referenznummer)))}`,
    }))
  return []
}

// Hospitality, food service and manufacturing, so a new catalog isn't only tech companies.
export const nonTechStarters: { kind: BoardKind; slug: string }[] = [
  "boschgroup",
  "accor",
  "sodexo",
].map((slug) => ({ kind: "smartrecruiters" as const, slug }))

// One board holding many companies' roles. Their slugs only give the board its name.
export const techFeeds: { kind: BoardKind; slug: string }[] = [
  { kind: "remoteok", slug: "remote-ok" },
  { kind: "hackernews", slug: "hacker-news" },
]

// Boards of many companies keep their own name, rather than their first role's company.
export const isCompanyBoard = (kind: BoardKind) =>
  !["arbeitsagentur", "remoteok", "hackernews"].includes(kind)

export const starterBoards: { kind: BoardKind; slug: string }[] = [
  ...[
    "vercel",
    "airbnb",
    "stripe",
    "figma",
    "discord",
    "cloudflare",
    "gitlab",
    "databricks",
    "anthropic",
    "duolingo",
    "reddit",
    "coinbase",
    "robinhood",
  ].map((slug) => ({ kind: "greenhouse" as const, slug })),
  ...["spotify", "palantir"].map((slug) => ({ kind: "lever" as const, slug })),
  ...["linear", "ramp", "notion", "openai", "supabase", "vanta", "cursor"].map((slug) => ({
    kind: "ashby" as const,
    slug,
  })),
  ...["cloover", "xitaso", "stark"].map((slug) => ({ kind: "personio" as const, slug })),
  ...nonTechStarters,
  ...techFeeds,
]

export const companyOf = (slug: string) =>
  slug.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())

const entities: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  "#39": "'",
  nbsp: " ",
}
const unescape = (s: string) => s.replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (_, e) => entities[e])

export const plainText = (html: string) =>
  unescape(unescape(html))
    .replace(/<(br|\/p|\/li|\/h\d|\/div)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim()

const textOf = (title: string, company: string, location: string, description: string) =>
  `${title}\n${company} · ${location}\n\n${description}`.slice(0, maxText)

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

const describe = (html: string, plain: string) => (html.trim() ? markdownOf(html) : plain)

const isRemote = (...hints: unknown[]) =>
  hints.some((h) => typeof h === "string" && /remote/i.test(h)) || hints.includes(true)

const list = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value) ? value.filter((v) => v && typeof v === "object") : []
const str = (value: unknown) => (typeof value === "string" ? value : "")
const timeOf = (value: unknown, fallback: number) => {
  const t = typeof value === "number" ? value : Date.parse(str(value))
  return Number.isFinite(t) ? t : fallback
}

// Lever splits a posting into a description, lists like "Requirements", and a closing
// part, each HTML.
const leverHtml = (j: Record<string, unknown>) =>
  [
    str(j.description),
    ...list(j.lists).map((l) => `<h3>${escapeHtml(str(l.text))}</h3><ul>${str(l.content)}</ul>`),
    str(j.additional),
  ].join("")

const place = (...parts: unknown[]) => parts.map(str).filter(Boolean).join(", ")

// It corrects a place it doesn't know to the nearest German one: "Paris" comes back as "Parin".
const placeMatches = (slug: string, body: Record<string, unknown>) => {
  const found = str((body.woOutput as Record<string, unknown>)?.bereinigterOrt).toLowerCase()
  const { where } = searchOf(slug)
  return !where || found.startsWith(where) || where.startsWith(found || "\0")
}

export const parseFeed = (
  kind: BoardKind,
  slug: string,
  json: unknown,
  now: number,
  details: Map<string, unknown> = new Map()
): FeedJob[] => {
  const body = json && typeof json === "object" ? (json as Record<string, unknown>) : {}
  const fallbackCompany = companyOf(slug)
  if (kind === "smartrecruiters")
    return list(body.content).map((j) => {
      const detail = (details.get(str(j.id)) ?? {}) as Record<string, unknown>
      const company = str((j.company as Record<string, unknown>)?.name) || fallbackCompany
      const where = (j.location ?? {}) as Record<string, unknown>
      const location = str(where.fullLocation)
      const ad = (detail.jobAd ?? {}) as Record<string, unknown>
      const sections = (ad.sections ?? {}) as Record<string, Record<string, unknown>>
      const html = ["jobDescription", "qualifications", "additionalInformation"]
        .map((s) => str(sections[s]?.text))
        .join("")
      return {
        // Empty if the role's own request failed, which drops it until the next fetch: its
        // link has its title in it, so a made-up one would count as another role.
        url: str(detail.postingUrl),
        title: str(j.name),
        company,
        location,
        remote: isRemote(location, where.remote),
        postedAt: timeOf(j.releasedDate, now),
        text: textOf(str(j.name), company, location, describe(html, "")),
      }
    })
  if (kind === "workable") {
    const company = str(body.name) || fallbackCompany
    return list(body.jobs).map((j) => {
      const location = place(j.city, j.state, j.country)
      return {
        // Its feed links to /j/code, without the company that a pasted link has.
        url: `https://apply.workable.com/${encodeURIComponent(slug)}/j/${encodeURIComponent(str(j.shortcode))}/`,
        title: str(j.title),
        company,
        location,
        remote: isRemote(location, j.telecommuting),
        postedAt: timeOf(j.published_on, now),
        text: textOf(str(j.title), company, location, describe(str(j.description), "")),
      }
    })
  }
  if (kind === "remoteok")
    return list(json).map((j) => {
      const location = str(j.location)
      // Its API terms ask for a link back, which `url` is, and to name it as the source.
      const company = `${str(j.company)} · via Remote OK`
      return {
        url: str(j.url),
        title: str(j.position),
        company,
        location,
        remote: true,
        postedAt: timeOf(Number(j.epoch) * 1000, now),
        text: textOf(str(j.position), company, location, describe(str(j.description), "")),
      }
    })
  if (kind === "hackernews") {
    const thread = (details.values().next().value ?? {}) as Record<string, unknown>
    return list(thread.children)
      .filter((c) => str(c.text))
      .map((c) => {
        // One comment per company, by convention "Company | Role | Where | Remote" up top.
        const top = plainText(
          str(c.text)
            .split(/<p>/i)[0]!
            .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) =>
              String.fromCodePoint(parseInt(hex, 16))
            )
        )
        const company = top.split(/\s[|—–-]\s/)[0]!.slice(0, 120)
        return {
          url: `https://news.ycombinator.com/item?id=${str(String(c.id))}`,
          title: top.slice(0, 160),
          company,
          location: "",
          remote: isRemote(top),
          postedAt: timeOf(Number(c.created_at_i) * 1000, now),
          text: textOf(top.slice(0, 160), company, "", describe(str(c.text), "")),
        }
      })
  }
  if (kind === "arbeitsagentur") {
    if (!placeMatches(slug, body)) return []
    return list(body.ergebnisliste).map((j) => {
      const ref = str(j.referenznummer)
      const detail = (details.get(ref) ?? {}) as Record<string, unknown>
      const title = str(j.stellenangebotsTitel)
      const company = str(j.firma)
      const location = [
        ...new Set(
          list(j.stellenlokationen).map((l) => str((l.adresse as Record<string, unknown>)?.ort))
        ),
      ]
        .filter(Boolean)
        .join(", ")
      // Already Markdown, and the app sanitizes what it draws.
      const description = str(detail.stellenangebotsBeschreibung) || str(j.hauptberuf)
      const pay =
        typeof j.gehaltsspanneVon === "number"
          ? `\n\nPay: ${j.gehaltsspanneVon}${typeof j.gehaltsspanneBis === "number" ? `-${j.gehaltsspanneBis}` : ""} (${str(j.verguetungsangabe)})`
          : ""
      return {
        url: `https://www.arbeitsagentur.de/jobsuche/jobdetail/${encodeURIComponent(ref)}`,
        title,
        company,
        location,
        remote: /remote|home.?office/i.test(title),
        postedAt: timeOf(j.datumErsteVeroeffentlichung, now),
        text: textOf(title, company, location, description + pay),
      }
    })
  }
  if (kind === "greenhouse")
    return list(body.jobs).map((j) => {
      const company = str(j.company_name) || fallbackCompany
      const location = str((j.location as Record<string, unknown>)?.name)
      return {
        url: str(j.absolute_url),
        title: str(j.title),
        company,
        location,
        remote: isRemote(location),
        postedAt: timeOf(j.first_published ?? j.updated_at, now),
        // Greenhouse escapes its HTML once more.
        text: textOf(str(j.title), company, location, describe(unescape(str(j.content)), "")),
      }
    })
  if (kind === "lever")
    return list(json).map((j) => {
      const categories = (j.categories ?? {}) as Record<string, unknown>
      const location = str(categories.location)
      return {
        url: str(j.hostedUrl),
        title: str(j.text),
        company: fallbackCompany,
        location,
        remote: isRemote(location, j.workplaceType),
        postedAt: timeOf(j.createdAt, now),
        text: textOf(
          str(j.text),
          fallbackCompany,
          location,
          describe(leverHtml(j), str(j.descriptionPlain))
        ),
      }
    })
  if (kind === "personio") return parsePersonio(slug, str(json), now)
  return list(body.jobs)
    .filter((j) => j.isListed !== false)
    .map((j) => {
      const location = str(j.location)
      return {
        url: str(j.jobUrl),
        title: str(j.title),
        company: fallbackCompany,
        location,
        remote: isRemote(location, j.workplaceType, j.isRemote),
        postedAt: timeOf(j.publishedAt, now),
        text: textOf(
          str(j.title),
          fallbackCompany,
          location,
          describe(str(j.descriptionHtml), str(j.descriptionPlain))
        ),
      }
    })
}

// Personio sends XML: one <position> per role, its text in CDATA sections.
const tag = (xml: string, name: string) =>
  new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(xml)?.[1]?.trim() ?? ""
const cdata = (s: string) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")

const parsePersonio = (slug: string, xml: string, now: number): FeedJob[] =>
  xml
    .split("<position>")
    .slice(1)
    .map((p) => {
      const title = plainText(tag(p, "name"))
      const company = companyOf(slug)
      const offices = [...p.matchAll(/<office>([\s\S]*?)<\/office>/g)].map((m) =>
        plainText(m[1] ?? "")
      )
      const location = [...new Set(offices)].join(", ")
      const description = [...p.matchAll(/<value>([\s\S]*?)<\/value>/g)]
        .map((m) => markdownOf(cdata(m[1] ?? "")))
        .join("\n\n")
      return {
        url: `https://${slug}.jobs.personio.de/job/${tag(p, "id")}`,
        title,
        company,
        location,
        remote: isRemote(location, title),
        postedAt: timeOf(tag(p, "createdAt"), now),
        text: textOf(title, company, location, description),
      }
    })
    .filter((j) => /\/job\/\d+$/.test(j.url))
