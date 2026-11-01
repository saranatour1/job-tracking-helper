import { trackAgents } from "@databuddy/sdk/agents"
import handler from "@tanstack/react-start/server-entry"

import { discovery } from "@/lib/discovery"
import { site } from "@/lib/seo"

type Env = { ASSETS: { fetch: (request: Request) => Promise<Response> } }
type Context = { waitUntil: (promise: Promise<void>) => void }

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
    // wrangler.jsonc runs the Worker first for .txt files, so reads of llms.txt get recorded.
    return env && pathname.endsWith(".txt") ? env.ASSETS.fetch(request) : handler.fetch(request)
  },
}
