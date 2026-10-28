// Job boards with a free public feed of every open role at a company. The catalog is
// built from these feeds; paid search is only used to find more boards.

export const boardKinds = ["greenhouse", "lever", "ashby"] as const
export type BoardKind = (typeof boardKinds)[number]

// A role as the catalog keeps it. `text` is what search and Jev read: the title line,
// then the description, cut so one role stays well under Jev's context.
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
      : `https://api.ashbyhq.com/posting-api/job-board/${slug}`

// Boards to start from, so the catalog has a few thousand roles before anyone's search
// has found a board. Checked by hand in October 2026.
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
]

// The board a posting URL belongs to, so a search result can add its whole board.
export const boardOf = (url: string): { kind: BoardKind; slug: string } | null => {
  if (!URL.canParse(url)) return null
  const u = new URL(url)
  const host = u.hostname.toLowerCase()
  const slug = u.pathname.split("/").filter(Boolean)[0]?.toLowerCase()
  if (!slug) return null
  if (host === "boards.greenhouse.io" || host === "job-boards.greenhouse.io")
    return { kind: "greenhouse", slug }
  if (host === "jobs.lever.co") return { kind: "lever", slug }
  if (host === "jobs.ashbyhq.com") return { kind: "ashby", slug }
  return null
}

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

// Greenhouse sends escaped HTML; the others send plain text too.
export const plainText = (html: string) =>
  unescape(unescape(html))
    .replace(/<(br|\/p|\/li|\/h\d|\/div)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim()

const textOf = (title: string, company: string, location: string, description: string) =>
  `${title}\n${company} · ${location}\n\n${description}`.slice(0, maxText)

const isRemote = (...hints: unknown[]) =>
  hints.some((h) => typeof h === "string" && /remote/i.test(h)) || hints.includes(true)

const list = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value) ? value.filter((v) => v && typeof v === "object") : []
const str = (value: unknown) => (typeof value === "string" ? value : "")
const timeOf = (value: unknown, fallback: number) => {
  const t = typeof value === "number" ? value : Date.parse(str(value))
  return Number.isFinite(t) ? t : fallback
}

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
        text: textOf(str(j.title), company, location, plainText(str(j.content))),
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
        text: textOf(str(j.text), fallbackCompany, location, str(j.descriptionPlain)),
      }
    })
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
        text: textOf(str(j.title), fallbackCompany, location, str(j.descriptionPlain)),
      }
    })
}

// The description alone, for a short preview under a role's title.
export const previewOf = (text: string, length = 240) =>
  (text.split("\n\n").slice(1).join(" ") || text).replace(/\s+/g, " ").slice(0, length)
