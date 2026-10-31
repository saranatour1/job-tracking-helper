import { markdownOf } from "../../lib/markdown"

export const boardKinds = ["greenhouse", "lever", "ashby", "personio"] as const
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

export const feedUrl = (kind: BoardKind, slug: string) =>
  kind === "greenhouse"
    ? `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=true`
    : kind === "lever"
      ? `https://api.lever.co/v0/postings/${slug}?mode=json`
      : kind === "ashby"
        ? `https://api.ashbyhq.com/posting-api/job-board/${slug}`
        : `https://${slug}.jobs.personio.de/xml?language=en`

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

export const parseFeed = (kind: BoardKind, slug: string, json: unknown, now: number): FeedJob[] => {
  const body = json && typeof json === "object" ? (json as Record<string, unknown>) : {}
  const fallbackCompany = companyOf(slug)
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
