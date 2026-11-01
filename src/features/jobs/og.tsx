import { ImageResponse } from "@cf-wasm/og"
import figtree from "@fontsource/figtree/files/figtree-latin-700-normal.woff?inline"
import { ConvexHttpClient } from "convex/browser"

import { api } from "@/lib/api"
import { site } from "@/lib/seo"

const dayS = 24 * 60 * 60

type Context = { waitUntil: (promise: Promise<void>) => void }

const Card = ({ title, company, where }: { title: string; company: string; where: string }) => (
  <div
    style={{
      display: "flex",
      flexDirection: "column",
      justifyContent: "space-between",
      width: "100%",
      height: "100%",
      padding: 80,
      background: "#ffffff",
      color: "#0a0a0a",
      fontFamily: "Figtree",
    }}
  >
    <div style={{ display: "flex", alignItems: "center", gap: 20, fontSize: 30 }}>
      {/* public/logo.svg */}
      <svg width="60" height="60" viewBox="0 0 96 96">
        <path
          d="M2.500 50C2.500 23 23 4 49 4c23 0 43 14 43 34 0 6-1 10-3 14L46 40 6 60c-2-3-3.500-6-3.500-10Z"
          fill="#b45309"
        />
        <path
          d="M44.700 39 52 52c2 8 0 18-4 22-4 2-8 0-9-2 3-10 5.700-22 5.700-33Z"
          fill="#78350f"
        />
        <path
          d="M44.700 39C44.700 50 42 64 37.500 76 35 84 32 90 27.500 89.500 15 86 5 68 5 49 5 26 24 9.500 48 9.500c22 0 41 12.500 41 28.500 0 14-7 32-14 41-2.500 3.500-6 3-9-1.500C60 70 49 54 44.700 39Z"
          fill="#f59e0b"
        />
      </svg>
      {site.name}
    </div>
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ display: "block", fontSize: 68, lineHeight: 1.1, lineClamp: 3 }}>{title}</div>
      <div style={{ display: "block", fontSize: 34, color: "#525252", lineClamp: 1 }}>
        {`${company} · ${where}`}
      </div>
    </div>
  </div>
)

// A posting's link preview. Link previews need a PNG; none of the big ones read SVG.
export const postingImage = async (request: Request, id: string, ctx?: Context) => {
  // Without the query string, so nobody can make it draw the same role again by adding one.
  const key = new Request(new URL(request.url).origin + new URL(request.url).pathname)
  // Only Workers has this; local dev draws every time.
  const cache = ctx && (await caches.open("posting-images"))
  const hit = await cache?.match(key)
  if (hit) return hit

  const job = await new ConvexHttpClient(String(import.meta.env.VITE_CONVEX_URL)).query(
    api.jobs.posting,
    { id }
  )
  if (!job) return new Response("Not found", { status: 404 })

  const image = await ImageResponse.async(
    <Card
      title={job.title}
      company={job.company}
      where={job.location || (job.remote ? "Remote" : "Location not listed")}
    />,
    {
      width: 1200,
      height: 630,
      fonts: [
        {
          name: "Figtree",
          weight: 700,
          data: await fetch(figtree).then((r) => r.arrayBuffer()),
        },
      ],
    }
  )
  const response = new Response(image.body, {
    headers: { "Content-Type": "image/png", "Cache-Control": `public, max-age=${dayS}` },
  })
  if (cache) ctx.waitUntil(cache.put(key, response.clone()))
  return response
}
