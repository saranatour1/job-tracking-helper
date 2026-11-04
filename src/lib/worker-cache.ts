type Context = { waitUntil: (promise: Promise<void>) => void }

/** A page's HTML kept at the edge for `seconds`, under its whole address and this deploy's
 * `version`. Only for pages the server renders the same for everyone. */
export const cachedPage = async (
  request: Request,
  version: string,
  seconds: number,
  ctx: Context,
  render: () => Response | Promise<Response>
) => {
  const cache = await caches.open(`pages-${version}`)
  const hit = await cache.match(request.url)
  if (hit) return hit
  const response = await render()
  if (response.ok && !response.headers.has("Set-Cookie")) {
    const kept = new Response(response.clone().body, response)
    kept.headers.set("Cache-Control", `public, max-age=${seconds}`)
    ctx.waitUntil(cache.put(request.url, kept))
  }
  return response
}

/** A response kept at the edge under its path, built by `make` when it isn't there yet. Only a
 * Worker passes `ctx`, so local dev builds it every time. */
export const cachedAt = async (
  request: Request,
  name: string,
  ctx: Context | undefined,
  make: () => Promise<Response>
) => {
  const url = new URL(request.url)
  const key = new Request(url.origin + url.pathname)
  const cache = ctx && (await caches.open(name))
  const hit = await cache?.match(key)
  if (hit) return hit
  const response = await make()
  if (cache && response.ok) ctx.waitUntil(cache.put(key, response.clone()))
  return response
}
