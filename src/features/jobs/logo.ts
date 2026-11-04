type Context = { waitUntil: (promise: Promise<void>) => void }

const weekS = 7 * 24 * 60 * 60
// Only a plain domain reaches the icon service, so the path can't point this anywhere else.
export const isDomain = (domain: string) =>
  domain.length <= 253 && /^((?!-)[a-z0-9-]{1,63}\.)+[a-z]{2,63}$/.test(domain)

// For a company with no icon: its first letter, readable on light and dark pages.
const letterTile = (domain: string) =>
  new Response(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="6" fill="#71717a"/><text x="16" y="21.5" font-family="system-ui,sans-serif" font-size="16" font-weight="600" fill="#fff" text-anchor="middle">${domain[0]!.toUpperCase()}</text></svg>`,
    { headers: { "Content-Type": "image/svg+xml", "Cache-Control": `public, max-age=${weekS}` } }
  )

/** A company's icon, by its domain, through this Worker so a visitor's browser never asks a third
 * party. DuckDuckGo gets the domain and nothing about who's looking. */
export const logo = async (request: Request, domain: string, ctx?: Context) => {
  if (!isDomain(domain)) return new Response("Not found", { status: 404 })
  const key = new Request(new URL(request.url).origin + new URL(request.url).pathname)
  // Only Workers has this; local dev asks every time.
  const cache = ctx && (await caches.open("company-logos"))
  const hit = await cache?.match(key)
  if (hit) return hit
  const icon = await fetch(`https://icons.duckduckgo.com/ip3/${domain}.ico`).catch(() => null)
  const type = icon?.headers.get("Content-Type") ?? ""
  const response =
    icon?.ok && type.startsWith("image/")
      ? new Response(icon.body, {
          headers: { "Content-Type": type, "Cache-Control": `public, max-age=${weekS}` },
        })
      : letterTile(domain)
  if (cache) ctx.waitUntil(cache.put(key, response.clone()))
  return response
}
