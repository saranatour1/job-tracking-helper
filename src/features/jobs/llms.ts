import { dimensions, weekMs, weekOf } from "@convex/features/jobs/dimensions"
import type { Facts } from "@convex/features/jobs/validators"
import { ConvexHttpClient } from "convex/browser"

import { api } from "@/lib/api"
import { postingId, postingText } from "@/lib/route-ids"
import { site } from "@/lib/seo"
import { cachedAt } from "@/lib/worker-cache"

type Context = { waitUntil: (promise: Promise<void>) => void }

const hourS = 60 * 60
const listed = 200

const factLabels: Record<keyof Facts, string> = {
  level: "Level",
  team: "Team",
  reportsTo: "Reports to",
  workMode: "Work mode",
  travel: "Travel",
  employment: "Type",
  pay: "Pay",
}

const markdown = (body: string, status = 200) =>
  new Response(body, {
    status,
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": `public, max-age=${hourS}`,
    },
  })

const day = (ms: number) => new Date(ms).toISOString().slice(0, 10)

type Role = {
  _id: string
  title: string
  company: string
  location: string
  remote: boolean
  postedAt: number
  url: string
  text: string
  summary: string | null
  facts: Facts | null
  places: string[]
  evidence: { domain: string | null }
}

/** One role as Markdown: what it is, its facts and where to apply, then the whole posting. */
export const roleMarkdown = (role: Role) => {
  const facts = role.facts
    ? (Object.keys(factLabels) as (keyof Facts)[])
        .filter((key) => role.facts?.[key])
        .map((key) => `- ${factLabels[key]}: ${role.facts![key]}`)
    : []
  return [
    `# ${role.title} at ${role.company}`,
    "",
    ...(role.summary ? [`> ${role.summary}`, ""] : []),
    `- Company: ${role.company}${role.evidence.domain ? ` (${role.evidence.domain})` : ""}`,
    `- Location: ${role.location || "Not listed"}${role.remote ? " (remote)" : ""}`,
    ...(role.places.length ? [`- Places: ${role.places.join(", ")}`] : []),
    `- Posted: ${day(role.postedAt)}`,
    ...facts,
    `- Apply: ${role.url}`,
    `- Page: ${site.url}/jobs/${postingText(role)}`,
    "",
    "## The posting",
    "",
    role.text.trim(),
    "",
  ].join("\n")
}

export const roleLlms = (request: Request, id: string, ctx?: Context) =>
  cachedAt(request, "role-llms", ctx, async () => {
    const role = await new ConvexHttpClient(String(import.meta.env.VITE_CONVEX_URL)).query(
      api.jobs.posting,
      { id: postingId(id) }
    )
    return role
      ? markdown(roleMarkdown(role))
      : markdown("# Not found\n\nThis role has closed.\n", 404)
  })

const shownInFull = 10

const roleLink = (role: { _id: string; title: string; company: string }) =>
  `[${role.title} at ${role.company}](${site.url}/jobs/${postingText(role)}/llms.txt)`

/** The newest roles: the first ten with what they are and where to apply, then the rest by title,
 * each linking to its own Markdown. */
export const jobsLlms = (request: Request, ctx?: Context) =>
  cachedAt(request, "role-llms", ctx, async () => {
    const http = new ConvexHttpClient(String(import.meta.env.VITE_CONVEX_URL))
    const [newest, { page }, stats] = await Promise.all([
      http.query(api.jobs.search, { paginationOpts: { numItems: shownInFull, cursor: null } }),
      http.query(api.jobs.sitemap, { cursor: null }),
      http.query(api.jobs.stats, {}),
    ])
    const full = new Set(newest.page.map((role) => role._id))
    const rest = page.filter((role) => !full.has(role._id)).slice(0, listed - full.size)
    return markdown(
      [
        `# Open roles at ${site.name}`,
        "",
        `> ${stats ? `${stats.jobs.toLocaleString("en")} open roles` : "Open roles"} from company job boards, refreshed daily. Each role has its own Markdown with its summary, facts, where to apply and the full posting.`,
        "",
        `- Every open role: ${site.url}/sitemap-jobs.xml`,
        `- New roles by country, place and title: ${site.url}/jobs/trends/llms.txt`,
        `- Search: ${site.url}/jobs?q=<words> (HTML)`,
        "",
        `## The ${newest.page.length} newest`,
        "",
        ...newest.page.flatMap((role) => [
          `### ${roleLink(role)}`,
          "",
          ...(role.summary ? [role.summary, ""] : []),
          `- Where: ${role.places.join(", ") || role.location || "Not listed"}`,
          `- Posted: ${day(role.postedAt)}`,
          ...(role.facts?.level ? [`- Level: ${role.facts.level}`] : []),
          ...(role.facts?.pay ? [`- Pay: ${role.facts.pay}`] : []),
          `- Apply: ${role.url}`,
          "",
        ]),
        `## ${rest.length} more`,
        "",
        ...rest.map((role) => `- ${roleLink(role)}: posted ${day(role.postedAt)}`),
        "",
      ].join("\n")
    )
  })

const dimensionLabels = { country: "country", place: "location", title: "job title" } as const

/** Last full week's most new roles by country, location and job title, each linking to a search. */
export const trendsLlms = (request: Request, ctx?: Context) =>
  cachedAt(request, "role-llms", ctx, async () => {
    const http = new ConvexHttpClient(String(import.meta.env.VITE_CONVEX_URL))
    const week = weekOf(Date.now())
    const tables = await Promise.all(
      dimensions.map((dimension) => http.query(api.jobs.trends, { dimension, week }))
    )
    return markdown(
      [
        `# Job trends at ${site.name}`,
        "",
        `> New roles posted in the week of ${day(week - weekMs)}, from company job boards. Counting began in November 2026, so older weeks only hold roles that were still open then.`,
        "",
        `- The page: ${site.url}/jobs/trends`,
        `- The roles: ${site.url}/jobs/llms.txt`,
        "",
        ...dimensions.flatMap((dimension, i) => [
          `## By ${dimensionLabels[dimension]}`,
          "",
          ...tables[i]!.map(({ label, weeks }) => {
            const last = weeks.find((w) => w.week === week - weekMs)?.roles ?? 0
            return `- [${label}](${site.url}/jobs?q=${encodeURIComponent(label)}): ${last.toLocaleString("en")} new`
          }),
          "",
        ]),
      ].join("\n")
    )
  })
