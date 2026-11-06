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

// Convex Auth keeps the token in localStorage and hands its fetcher only to setAuth, so the server
// never has one.
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
    fetchToken = undefined
    super.clearAuth()
    changed()
  }
}

export const convex = new Client(convexUrl)

export const httpClient = async () => {
  const http = new ConvexHttpClient(convexUrl)
  let token = (await fetchToken?.({ forceRefreshToken: false })) ?? null
  if (token && isTokenExpiring(token))
    token = (await fetchToken?.({ forceRefreshToken: true })) ?? null
  if (token) http.setAuth(token)
  return { http, signedIn: Boolean(token) }
}

export const onAuthChange = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

// shortcut: Convex has no public pause, so this calls the socket's private stop and restart, the same
// pair its own token refresh uses. Recheck after a Convex upgrade.
type Socket = { stop: () => Promise<void>; tryRestart: () => void }
/** Closes the connection, or opens it again. Queries and mutations wait and resend on reconnect. */
export const setLive = (live: boolean) => {
  const socket = (convex as unknown as { sync: { webSocketManager: Socket } }).sync.webSocketManager
  if (live) socket.tryRestart()
  else void socket.stop()
}
