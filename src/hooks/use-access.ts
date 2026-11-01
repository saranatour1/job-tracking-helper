import { useConvexAuth } from "convex/react"
import { useQuery } from "convex-helpers/react/cache/hooks"

import { api } from "@/lib/api"

/** Who this is. An anonymous account only exists to search Jobs, so it sees Jobs as anyone does.
 * Local dev's "Continue as guest" is the same kind of account, and still gets the rest of the app. */
export const useAccess = () => {
  const { isAuthenticated, isLoading } = useConvexAuth()
  const me = useQuery(api.users.me, isAuthenticated ? {} : "skip")
  return {
    loading: isLoading || (isAuthenticated && me === undefined),
    allowedSearch: me?.allowedSearch ?? null,
    /** Has a real account, so gets filters and verdicts on Jobs. */
    member: Boolean(me && !me.anonymous),
    /** Can open the rest of the app. */
    inApp: Boolean(me && (!me.anonymous || import.meta.env.DEV)),
  }
}
