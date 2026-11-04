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

/** The newest roles, each linking to its own Markdown, and where to find the rest. */
export const jobsLlms = (request: Request, ctx?: Context) =>
  cachedAt(request, "role-llms", ctx, async () => {
    const http = new ConvexHttpClient(String(import.meta.env.VITE_CONVEX_URL))
    const [{ page }, stats] = await Promise.all([
      http.query(api.jobs.sitemap, { cursor: null }),
      http.query(api.jobs.stats, {}),
    ])
    return markdown(
      [
        `# Open roles at ${site.name}`,
        "",
        `> ${stats ? `${stats.jobs.toLocaleString("en")} open roles` : "Open roles"} from company job boards, refreshed daily. Each links to its own Markdown with its summary, facts, where to apply and the full posting.`,
        "",
        `- Every open role: ${site.url}/sitemap-jobs.xml`,
        `- Search them: ${site.url}/jobs?q=<words> (HTML)`,
        "",
        `## The ${Math.min(listed, page.length)} newest`,
        "",
        ...page
          .slice(0, listed)
          .map(
            (role) =>
              `- [${role.title} at ${role.company}](${site.url}/jobs/${postingText(role)}/llms.txt): posted ${day(role.postedAt)}`
          ),
        "",
      ].join("\n")
    )
  })
