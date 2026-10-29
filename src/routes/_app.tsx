import { api } from "@convex/_generated/api"
import { Navigate, Outlet, createFileRoute, useRouterState } from "@tanstack/react-router"
import { Authenticated, Unauthenticated } from "convex/react"
import { useQuery } from "convex-helpers/react/cache/hooks"

import { AppShell } from "@/features/shell/app-shell"

// New accounts start on Preferences. Saving or "Skip for now" there stops this.
const FirstRun = () => {
  const me = useQuery(api.users.me)
  const path = useRouterState({ select: (s) => s.location.pathname })
  return me && !me.onboarded && path === "/" ? <Navigate to="/preferences" replace /> : null
}

const AppLayout = () => (
  <>
    <Authenticated>
      <FirstRun />
      <AppShell>
        <Outlet />
      </AppShell>
    </Authenticated>
    <Unauthenticated>
      <Navigate to="/sign-in" replace />
    </Unauthenticated>
  </>
)

export const Route = createFileRoute("/_app")({ component: AppLayout })
