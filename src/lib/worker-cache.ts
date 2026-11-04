type Context = { waitUntil: (promise: Promise<void>) => void }

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
