import { ConvexHttpClient } from "convex/browser"

import { api } from "@/lib/api"
import { postingText } from "@/lib/route-ids"
import { site } from "@/lib/seo"

const dayS = 24 * 60 * 60
// A sitemap holds 50,000 URLs at most, and each page of postings is 2,000.
const maxPages = 24
const pages = ["/", "/jobs", "/privacy", "/terms"]

type Context = { waitUntil: (promise: Promise<void>) => void }
type Posting = { _id: string; title: string; company: string; postedAt: number }

// Paths are only letters, digits and dashes, so nothing here needs escaping.
export const sitemapXml = (jobs: Posting[]) =>
  [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
    ...pages.map((path) => `  <url><loc>${site.url}${path}</loc></url>`),
    ...jobs.map(
      (job) =>
        `  <url><loc>${site.url}/jobs/${postingText(job)}</loc><lastmod>${new Date(job.postedAt).toISOString()}</lastmod></url>`
    ),
    `</urlset>`,
    ``,
  ].join("\n")

// ponytail: each build reads every posting, about 55 MB at 13,500 roles, once a day per Cloudflare
// location that gets asked. If that shows on the Convex bill, build it in a daily cron instead.
export const sitemap = async (request: Request, ctx?: Context) => {
  // Without the query string, so nobody can make it build again by adding one.
  const key = new Request(new URL(request.url).origin + new URL(request.url).pathname)
  // Only Workers has this; local dev builds every time.
  const cache = ctx && (await caches.open("sitemap"))
  const hit = await cache?.match(key)
  if (hit) return hit

  const client = new ConvexHttpClient(String(import.meta.env.VITE_CONVEX_URL))
  const jobs: Posting[] = []
  let cursor: string | null = null
  for (let i = 0; i < maxPages; i++) {
    const found: { page: Posting[]; isDone: boolean; continueCursor: string } = await client.query(
      api.jobs.sitemapPage,
      { cursor }
    )
    jobs.push(...found.page)
    if (found.isDone) break
    cursor = found.continueCursor
  }

  const response = new Response(sitemapXml(jobs), {
    headers: { "Content-Type": "application/xml", "Cache-Control": `public, max-age=${dayS}` },
  })
  if (cache) ctx.waitUntil(cache.put(key, response.clone()))
  return response
}
