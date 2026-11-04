import { cachedAt } from "@/lib/worker-cache"

type Context = { waitUntil: (promise: Promise<void>) => void }

const weekS = 7 * 24 * 60 * 60
export const isDomain = (domain: string) =>
  domain.length <= 253 && /^((?!-)[a-z0-9-]{1,63}\.)+[a-z]{2,63}$/.test(domain)

const letterTile = (domain: string) =>
  new Response(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="6" fill="#71717a"/><text x="16" y="21.5" font-family="system-ui,sans-serif" font-size="16" font-weight="600" fill="#fff" text-anchor="middle">${domain[0]!.toUpperCase()}</text></svg>`,
    { headers: { "Content-Type": "image/svg+xml", "Cache-Control": `public, max-age=${weekS}` } }
  )

export const logo = (request: Request, domain: string, ctx?: Context) =>
  isDomain(domain)
    ? cachedAt(request, "company-logos", ctx, async () => {
        const icon = await fetch(`https://icons.duckduckgo.com/ip3/${domain}.ico`).catch(() => null)
        const type = icon?.headers.get("Content-Type") ?? ""
        return icon?.ok && type.startsWith("image/")
          ? new Response(icon.body, {
              headers: { "Content-Type": type, "Cache-Control": `public, max-age=${weekS}` },
            })
          : letterTile(domain)
      })
    : Promise.resolve(new Response("Not found", { status: 404 }))
