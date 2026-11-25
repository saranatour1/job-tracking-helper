import { trackAgents } from "@databuddy/sdk/agents"
import handler from "@tanstack/react-start/server-entry"

import { discovery } from "@/lib/discovery"
import { site } from "@/lib/seo"
import { cachedPage } from "@/lib/worker-cache"

type Env = {
  ASSETS: { fetch: (request: Request) => Promise<Response> }
  CF_VERSION_METADATA?: { id: string }
}
type Context = { waitUntil: (promise: Promise<void>) => void }

// The server never knows who's asking, so these render the same for everyone. Signed in, the
// browser reads its own data over HTTP after it loads.
const publicPages: [RegExp, number][] = [
  [/^\/jobs\/trends$/, 10 * 60],
  [/^\/jobs$/, 60],
  [/^\/jobs\/[^/]+$/, 24 * 60 * 60],
]

// Crawlers were 94% of requests, nearly all on role pages, and each one costs a render.
// robots.txt keeps them off, and this refuses the ones that ask anyway. Link previews still get
// the page, since they read its head.
const crawler = /bot|crawl|spider|anthropic-ai|meta-externalagent/i
const preview =
  /Slackbot|Twitterbot|Discordbot|LinkedInBot|TelegramBot|facebookexternalhit|WhatsApp/i
const rolePage = /^\/jobs\/(?!trends$)[^/]+$/

// An agent that asks for markdown gets the llms.txt written for that page. Other pages have none,
// so they answer as before.
// ponytail: any mention of text/markdown wins, q-values ignored; browsers never send it.
const markdownOf: Record<string, string | undefined> = {
  "/": "/llms.txt",
  "/jobs": "/jobs/llms.txt",
  "/jobs/trends": "/jobs/trends/llms.txt",
}

const route = (request: Request, env?: Env, ctx?: Context) => {
  const { pathname } = new URL(request.url)
  const reading = request.method === "GET" || request.method === "HEAD"
  const document = reading ? discovery[pathname] : null
  if (document) return document()
  const posting = reading ? /^\/jobs\/([^/]+)\/og\.png$/.exec(pathname) : null
  // Imported here, so the image library only loads for the requests that draw one.
  if (posting)
    return import("@/features/jobs/og").then((og) => og.postingImage(request, posting[1], ctx))
  if (reading && pathname === "/jobs/trends/llms.txt")
    return import("@/features/jobs/llms").then((l) => l.trendsLlms(request, ctx))
  if (reading && pathname === "/jobs/llms.txt")
    return import("@/features/jobs/llms").then((l) => l.jobsLlms(request, ctx))
  const company = reading ? /^\/jobs\/logo\/([^/]+)$/.exec(pathname) : null
  if (company) return import("@/features/jobs/logo").then((l) => l.logo(request, company[1]!, ctx))
  // wrangler.jsonc runs the Worker first for .txt files, so reads of llms.txt get recorded.
  if (env && pathname.endsWith(".txt")) return env.ASSETS.fetch(request)
  const agent = request.headers.get("user-agent") ?? ""
  if (rolePage.test(pathname) && crawler.test(agent) && !preview.test(agent))
    return new Response(`Role pages aren't for crawlers. Read ${site.url}/jobs/llms.txt.`, {
      status: 403,
    })
  const seconds = request.method === "GET" && publicPages.find(([path]) => path.test(pathname))?.[1]
  return seconds && env?.CF_VERSION_METADATA && ctx
    ? cachedPage(request, env.CF_VERSION_METADATA.id, seconds, ctx, () => handler.fetch(request))
    : handler.fetch(request)
}

export default {
  // Local dev runs in Node, which passes only the request and serves public/ itself.
  fetch: async (request: Request, env?: Env, ctx?: Context) => {
    ctx?.waitUntil(trackAgents(request, { websiteId: site.databuddyId }))
    const llms = request.headers.get("accept")?.includes("text/markdown")
      ? markdownOf[new URL(request.url).pathname]
      : undefined
    if (!llms) return route(request, env, ctx)
    const response = await route(new Request(new URL(llms, request.url), request), env, ctx)
    if (!response.ok) return response
    // The page's address now has two bodies, so caches have to tell them apart.
    const headers = new Headers(response.headers)
    headers.set("Content-Type", "text/markdown; charset=utf-8")
    headers.set("Vary", "Accept")
    return new Response(response.body, { status: response.status, headers })
  },
}
