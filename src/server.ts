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
  [/^\/jobs\/[^/]+$/, 5 * 60],
]

// AI training crawlers that send their own user agent. robots.txt asks them to read each role's
// llms.txt instead of its page, and this refuses the ones that still ask for the page, which
// costs a render. Google-Extended and Applebot-Extended only exist in robots.txt.
const trainer =
  /GPTBot|ClaudeBot|anthropic-ai|CCBot|Bytespider|meta-externalagent|cohere-training-data-crawler/i
const rolePage = /^\/jobs\/(?!trends$)[^/]+$/

export default {
  // Local dev runs in Node, which passes only the request and serves public/ itself.
  fetch: (request: Request, env?: Env, ctx?: Context) => {
    const { pathname } = new URL(request.url)
    ctx?.waitUntil(trackAgents(request, { websiteId: site.databuddyId }))
    const reading = request.method === "GET" || request.method === "HEAD"
    const document = reading ? discovery[pathname] : null
    if (document) return document()
    const posting = reading ? /^\/jobs\/([^/]+)\/og\.png$/.exec(pathname) : null
    // Imported here, so the image library only loads for the requests that draw one.
    if (posting)
      return import("@/features/jobs/og").then((og) => og.postingImage(request, posting[1], ctx))
    if (reading && pathname === "/jobs/trends/llms.txt")
      return import("@/features/jobs/llms").then((l) => l.trendsLlms(request, ctx))
    const roleText = reading ? /^\/jobs\/([^/]+)\/llms\.txt$/.exec(pathname) : null
    if (roleText)
      return import("@/features/jobs/llms").then((l) => l.roleLlms(request, roleText[1]!, ctx))
    if (reading && pathname === "/jobs/llms.txt")
      return import("@/features/jobs/llms").then((l) => l.jobsLlms(request, ctx))
    if (reading && pathname === "/sitemap-jobs.xml")
      return import("@/features/jobs/sitemap").then((s) => s.jobsSitemap(request, ctx))
    const company = reading ? /^\/jobs\/logo\/([^/]+)$/.exec(pathname) : null
    if (company)
      return import("@/features/jobs/logo").then((l) => l.logo(request, company[1]!, ctx))
    // wrangler.jsonc runs the Worker first for .txt files, so reads of llms.txt get recorded.
    if (env && pathname.endsWith(".txt")) return env.ASSETS.fetch(request)
    if (rolePage.test(pathname) && trainer.test(request.headers.get("user-agent") ?? ""))
      return new Response("Read this role's llms.txt instead.", { status: 403 })
    const seconds =
      request.method === "GET" && publicPages.find(([path]) => path.test(pathname))?.[1]
    return seconds && env?.CF_VERSION_METADATA && ctx
      ? cachedPage(request, env.CF_VERSION_METADATA.id, seconds, ctx, () => handler.fetch(request))
      : handler.fetch(request)
  },
}
