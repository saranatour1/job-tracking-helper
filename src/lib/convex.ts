import { isTokenExpiring } from "@convex-dev/auth/ssr"
import { ConvexHttpClient } from "convex/browser"
import { type AuthTokenFetcher, ConvexReactClient } from "convex/react"

const convexUrl: string | undefined = import.meta.env.VITE_CONVEX_URL
if (!convexUrl) {
  throw new Error("VITE_CONVEX_URL is not set. Run `npx convex dev` to write it to .env.local.")
}

let fetchToken: AuthTokenFetcher | undefined
const listeners = new Set<() => void>()
const changed = () => listeners.forEach((listener) => listener())

// The WebSocket client, which also lends its sign-in to HTTP requests. Convex Auth keeps the token
// in this browser's storage, so the server never has one.
class Client extends ConvexReactClient {
  override setAuth(
    fetcher: AuthTokenFetcher,
    onChange?: (isAuthenticated: boolean) => void,
    onRefreshChange?: (isRefreshing: boolean) => void
  ) {
    fetchToken = fetcher
    super.setAuth(
      fetcher,
      (ok) => {
        onChange?.(ok)
        changed()
      },
      onRefreshChange
    )
  }
  override clearAuth() {
    const had = Boolean(fetchToken)
    fetchToken = undefined
    super.clearAuth()
    // Every visitor starts signed out, so only a sign-out is news.
    if (had) changed()
  }
}

export const convex = new Client(convexUrl)

/** An HTTP client as whoever is signed in here: nobody on the server, or before sign-in. */
export const httpClient = async () => {
  const http = new ConvexHttpClient(convexUrl)
  let token = (await fetchToken?.({ forceRefreshToken: false })) ?? null
  if (token && isTokenExpiring(token))
    token = (await fetchToken?.({ forceRefreshToken: true })) ?? null
  if (token) http.setAuth(token)
  return { http, signedIn: Boolean(token) }
}

/** Calls back when someone signs in or out here, or the server confirms who it is. */
export const onAuthChange = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
