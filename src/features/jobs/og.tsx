import { ImageResponse } from "@cf-wasm/og"
import figtree from "@fontsource/figtree/files/figtree-latin-400-normal.woff?inline"
import figtreeBold from "@fontsource/figtree/files/figtree-latin-700-normal.woff?inline"
import { ConvexHttpClient } from "convex/browser"

import type { Row } from "@/features/jobs/jobs"
import { api } from "@/lib/api"

const dayS = 24 * 60 * 60

type Context = { waitUntil: (promise: Promise<void>) => void }

// ponytail: phrases, so "we're not remote-first" would still match. Only what a posting says about
// itself, since nothing stores culture. Asking Jev per posting would read better, but this
// endpoint is public, so anyone could run up that bill.
const culture: [RegExp, string][] = [
  [
    /\b(async[- ]first|asynchronous (work|culture|communication|collaboration)|work asynchronously)\b/i,
    "Async-first",
  ],
  [/\b(flexible (working )?(hours|schedules?)|flexible arbeitszeit(en)?)\b/i, "Flexible hours"],
  [/\b(4|four)[- ]day (work ?)?week\b/i, "4-day week"],
  [/\bunlimited (pto|vacation|paid time off|time off)\b/i, "Unlimited time off"],
  [/\bmission[- ]driven\b/i, "Mission-driven"],
  [/\bemployee[- ]owned\b/i, "Employee-owned"],
]

type Details = Pick<Row, "location" | "remote" | "evidence"> & { text: string }

/** The short facts on a role's image, most useful first and few enough to fit. */
export const detailsOf = ({ location, remote, text, evidence }: Details) => {
  const remoteFirst = /\bremote[- ]first\b/i.test(text)
  // One place and how many more, so a long list can't push the rest off the image.
  const [place, ...others] = location.split(";").map((part) => part.trim())
  return [
    (others.length ? `${place} +${others.length} more` : place) ||
      (remote ? "" : "Location not listed"),
    // A remote role isn't always at a remote-first company, so that's only ever its own words.
    remoteFirst ? "Remote-first" : remote && !/remote/i.test(location) ? "Remote" : "",
    ...culture.filter(([words]) => words.test(text)).map(([, label]) => label),
    // Only when its postings live on that site: a name match could be a copied name.
    evidence.link === "postings" && evidence.yc ? `YC ${evidence.yc.batch}` : "",
  ]
    .filter(Boolean)
    .slice(0, 3)
}

const line = "#3f3f46"
// How far in the lines sit, and how far in the text sits from them.
const edge = 65
const inset = 64

const Card = ({ job }: { job: Details & { title: string; company: string } }) => (
  <div
    style={{
      display: "flex",
      flexDirection: "column",
      gap: 20,
      width: "100%",
      height: "100%",
      padding: edge + inset,
      background: "#000000",
      color: "#ffffff",
      fontFamily: "Figtree",
    }}
  >
    {/* The lines around the edge, running off the image and crossing at each corner. */}
    {[{ top: edge }, { bottom: edge }].map((at, i) => (
      <div
        key={i}
        style={{ position: "absolute", left: 0, right: 0, height: 2, background: line, ...at }}
      />
    ))}
    {[{ left: edge }, { right: edge }].map((at, i) => (
      <div
        key={i}
        style={{ position: "absolute", top: 0, bottom: 0, width: 2, background: line, ...at }}
      />
    ))}
    <div
      style={{
        display: "block",
        maxWidth: 900,
        fontSize: 60,
        fontWeight: 700,
        lineHeight: 1.15,
        letterSpacing: -1,
        lineClamp: 3,
      }}
    >
      {job.title}
    </div>
    <div
      style={{
        display: "block",
        maxWidth: 820,
        fontSize: 34,
        fontWeight: 400,
        lineHeight: 1.6,
        color: "#a1a1aa",
        lineClamp: 2,
      }}
    >
      {[job.company, ...detailsOf(job)].join(" · ")}
    </div>
    {/* public/logo.svg */}
    <svg
      width="64"
      height="64"
      viewBox="0 0 96 96"
      style={{ position: "absolute", right: edge + 36, bottom: edge + 36 }}
    >
      <path
        d="M2.500 50C2.500 23 23 4 49 4c23 0 43 14 43 34 0 6-1 10-3 14L46 40 6 60c-2-3-3.500-6-3.500-10Z"
        fill="#b45309"
      />
      <path d="M44.700 39 52 52c2 8 0 18-4 22-4 2-8 0-9-2 3-10 5.700-22 5.700-33Z" fill="#78350f" />
      <path
        d="M44.700 39C44.700 50 42 64 37.500 76 35 84 32 90 27.500 89.500 15 86 5 68 5 49 5 26 24 9.500 48 9.500c22 0 41 12.500 41 28.500 0 14-7 32-14 41-2.500 3.500-6 3-9-1.500C60 70 49 54 44.700 39Z"
        fill="#f59e0b"
      />
    </svg>
  </div>
)

const fontData = (font: string) => fetch(font).then((r) => r.arrayBuffer())

export const drawPosting = async (job: Details & { title: string; company: string }) =>
  ImageResponse.async(<Card job={job} />, {
    width: 1200,
    height: 630,
    fonts: [
      { name: "Figtree", weight: 700, data: await fontData(figtreeBold) },
      { name: "Figtree", weight: 400, data: await fontData(figtree) },
    ],
  })

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

  const image = await drawPosting(job)
  const response = new Response(image.body, {
    headers: { "Content-Type": "image/png", "Cache-Control": `public, max-age=${dayS}` },
  })
  if (cache) ctx.waitUntil(cache.put(key, response.clone()))
  return response
}
