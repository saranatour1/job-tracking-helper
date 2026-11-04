import { ConvexHttpClient } from "convex/browser"

import { api } from "@/lib/api"
import { postingText } from "@/lib/route-ids"
import { site } from "@/lib/seo"
import { cachedAt } from "@/lib/worker-cache"

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

export const jobsSitemap = (request: Request, ctx?: Context) =>
  cachedAt(request, "sitemaps", ctx, async () => {
    const file = await new ConvexHttpClient(String(import.meta.env.VITE_CONVEX_URL)).query(
      api.jobs.sitemapFile,
      {}
    )
    if (!file)
      return new Response("Not written yet", { status: 503, headers: { "Retry-After": "3600" } })
    const roles: Role[] = await (await fetch(file)).json()
    return new Response(sitemapXml(roles.slice(0, maxRoles)), {
      headers: { "Content-Type": "application/xml", "Cache-Control": `public, max-age=${dayS}` },
    })
  })
