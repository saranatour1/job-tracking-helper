import { trackAgents } from "@databuddy/sdk/agents"
import handler from "@tanstack/react-start/server-entry"

import { discovery } from "@/lib/discovery"
import { site } from "@/lib/seo"

type Env = {
  ASSETS: { fetch: (request: Request) => Promise<Response> }
  ROLE_PAGES: { limit: (options: { key: string }) => Promise<{ success: boolean }> }
}
type Context = { waitUntil: (promise: Promise<void>) => void }

export default {
  // Local dev runs in Node, which passes only the request and serves public/ itself.
  fetch: async (request: Request, env?: Env, ctx?: Context) => {
    const { pathname } = new URL(request.url)
    ctx?.waitUntil(trackAgents(request, { websiteId: site.databuddyId }))
    const reading = request.method === "GET" || request.method === "HEAD"
    const document = reading ? discovery[pathname] : null
    if (document) return document()
    // ponytail: per IP, and only here. api.jobs.posting stays open to direct calls, since crawlers
    // and link previews have no account to count, but its ids can't be guessed, only found by searching.
    if (reading && env && /^\/jobs\/[^/]+(\/og\.png)?$/.test(pathname)) {
      const key = request.headers.get("cf-connecting-ip") ?? "unknown"
      const { success } = await env.ROLE_PAGES.limit({ key })
      if (!success)
        return new Response("Too many requests", {
          status: 429,
          headers: { "Retry-After": "60" },
        })
    }
    const posting = reading ? /^\/jobs\/([^/]+)\/og\.png$/.exec(pathname) : null
    // Imported here, so the image library only loads for the requests that draw one.
    if (posting)
      return import("@/features/jobs/og").then((og) => og.postingImage(request, posting[1], ctx))
    // wrangler.jsonc runs the Worker first for .txt files, so reads of llms.txt get recorded.
    return env && pathname.endsWith(".txt") ? env.ASSETS.fetch(request) : handler.fetch(request)
  },
}
