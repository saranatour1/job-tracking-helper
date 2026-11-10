import { dimensions, weekMs, weekOf } from "@convex/features/jobs/dimensions"
import { ConvexHttpClient } from "convex/browser"

import { api } from "@/lib/api"
import { mcpUrl, site } from "@/lib/seo"
import { cachedAt } from "@/lib/worker-cache"

type Context = { waitUntil: (promise: Promise<void>) => void }

const hourS = 60 * 60

const markdown = (body: string) =>
  new Response(body, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": `public, max-age=${hourS}`,
    },
  })

const day = (ms: number) => new Date(ms).toISOString().slice(0, 10)

const shownInFull = 10

/** A snapshot: how many roles are open and the ten newest. The rest is the MCP server's job, so
 * crawlers don't walk every role. */
export const jobsLlms = (request: Request, ctx?: Context) =>
  cachedAt(request, "role-llms", ctx, async () => {
    const http = new ConvexHttpClient(String(import.meta.env.VITE_CONVEX_URL))
    const [newest, stats] = await Promise.all([
      http.query(api.jobs.search, { paginationOpts: { numItems: shownInFull, cursor: null } }),
      http.query(api.jobs.stats, {}),
    ])
    return markdown(
      [
        `# Open roles at ${site.name}`,
        "",
        `> ${stats ? `${stats.jobs.toLocaleString("en")} open roles` : "Open roles"} from company job boards, refreshed daily. This is a snapshot of the newest. Please don't crawl each role's page.`,
        "",
        "## To find out more",
        "",
        `- Search, read and track roles over the MCP server: ${mcpUrl} (how to connect: ${site.url}/auth.md)`,
        `- With no account, this skill searches the same public feeds: ${site.url}/.well-known/agent-skills/job-search-no-account/SKILL.md`,
        `- New roles by country, place and title: ${site.url}/jobs/trends/llms.txt`,
        "",
        `## The ${newest.page.length} newest`,
        "",
        ...newest.page.flatMap((role) => [
          `### ${role.title} at ${role.company}`,
          "",
          ...(role.summary ? [role.summary, ""] : []),
          `- Where: ${role.places.join(", ") || role.location || "Not listed"}`,
          `- Posted: ${day(role.postedAt)}`,
          ...(role.facts?.level ? [`- Level: ${role.facts.level}`] : []),
          ...(role.facts?.pay ? [`- Pay: ${role.facts.pay}`] : []),
          `- Apply: ${role.url}`,
          "",
        ]),
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
