import { useAuthToken } from "@convex-dev/auth/react"
import { useConvexAuth } from "convex/react"
import { useQueries } from "convex-helpers/react/cache/hooks"

import { api } from "@/lib/api"

/** Who this is. An anonymous account only exists to search Jobs, so it sees Jobs as anyone does.
 * Local dev's "Continue as guest" is the same kind of account, and still gets the rest of the app. */
export const useAccess = () => {
  const { isAuthenticated, isLoading } = useConvexAuth()
  const token = useAuthToken()
  // Asked for with a stored token, not once it's confirmed: both then share one trip to the server,
  // and every page waits on this. A token that turns out stale only gets an error, which stays quiet
  // until the session is confirmed.
  const { me: result } = useQueries(
    isAuthenticated || token ? { me: { query: api.users.me, args: {} } } : {}
  )
  if (result instanceof Error && isAuthenticated) throw result
  const me = result instanceof Error ? undefined : result
  return {
    loading: isLoading || (isAuthenticated && me === undefined),
    allowedSearch: me?.allowedSearch ?? null,
    /** Has a real account, so gets filters and verdicts on Jobs. */
    member: Boolean(me && !me.anonymous),
    /** Can open the rest of the app. */
    inApp: Boolean(me && (!me.anonymous || import.meta.env.DEV)),
  }
}
