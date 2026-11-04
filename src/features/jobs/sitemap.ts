import { ConvexHttpClient } from "convex/browser"

import { api } from "@/lib/api"
import { postingText } from "@/lib/route-ids"
import { site } from "@/lib/seo"

type Context = { waitUntil: (promise: Promise<void>) => void }

const dayS = 24 * 60 * 60
// A sitemap holds at most 50,000 addresses.
const maxRoles = 50_000

const escapeXml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

type Role = { _id: string; title: string; company: string; postedAt: number }

export const sitemapXml = (roles: Role[]) =>
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${roles
  .map(
    (role) =>
      `  <url><loc>${escapeXml(`${site.url}/jobs/${postingText(role)}`)}</loc><lastmod>${new Date(role.postedAt).toISOString().slice(0, 10)}</lastmod></url>`
  )
  .join("\n")}
</urlset>
`

/** Every open role's page, so Google finds them without paging through /jobs. Built once a day. */
export const jobsSitemap = async (request: Request, ctx?: Context) => {
  const key = new Request(new URL(request.url).origin + new URL(request.url).pathname)
  // Only Workers has this; local dev builds it every time.
  const cache = ctx && (await caches.open("sitemaps"))
  const hit = await cache?.match(key)
  if (hit) return hit
  const http = new ConvexHttpClient(String(import.meta.env.VITE_CONVEX_URL))
  const roles: Role[] = []
  let cursor: string | null = null
  while (roles.length < maxRoles) {
    const found: { page: Role[]; isDone: boolean; continueCursor: string } = await http.query(
      api.jobs.sitemap,
      { cursor }
    )
    roles.push(...found.page)
    if (found.isDone) break
    cursor = found.continueCursor
  }
  const response = new Response(sitemapXml(roles.slice(0, maxRoles)), {
    headers: { "Content-Type": "application/xml", "Cache-Control": `public, max-age=${dayS}` },
  })
  if (cache) ctx.waitUntil(cache.put(key, response.clone()))
  return response
}
