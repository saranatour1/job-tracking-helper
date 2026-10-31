import { trackAgents } from "@databuddy/sdk/agents"
import handler from "@tanstack/react-start/server-entry"

import { site } from "@/lib/seo"

type Env = { ASSETS: { fetch: (request: Request) => Promise<Response> } }
type Context = { waitUntil: (promise: Promise<void>) => void }

export default {
  // Local dev runs in Node, which passes only the request and serves public/ itself.
  fetch: (request: Request, env?: Env, ctx?: Context) => {
    const { pathname } = new URL(request.url)
    // Booking guests never agreed to analytics, so their pages stay out of it.
    if (!pathname.startsWith("/book/")) {
      ctx?.waitUntil(trackAgents(request, { websiteId: site.databuddyId }))
    }
    // wrangler.jsonc runs the Worker first for .txt files, so reads of llms.txt get recorded.
    return env && pathname.endsWith(".txt") ? env.ASSETS.fetch(request) : handler.fetch(request)
  },
}
