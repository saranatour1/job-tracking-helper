import { api } from "@/lib/api"
import { Link, Navigate, Outlet, createFileRoute, useRouterState } from "@tanstack/react-router"
import { useQuery } from "convex-helpers/react/cache/hooks"

import { Button } from "@/components/ui/button"
import { SiteFooter, SiteHeader } from "@/features/landing/site-frame"
import { AppShell } from "@/features/shell/app-shell"
import { useAccess } from "@/hooks/use-access"

// New accounts start on Preferences. Saving or "Skip for now" there stops this.
const FirstRun = () => {
  const me = useQuery(api.users.me)
  const path = useRouterState({ select: (s) => s.location.pathname })
  return me && !me.onboarded && path === "/pipeline" ? <Navigate to="/preferences" replace /> : null
}

// Jobs sits under this layout so members keep their sidebar there, but it's open to anyone.
const AppLayout = () => {
  const { loading, member, inApp } = useAccess()
  const path = useRouterState({ select: (s) => s.location.pathname })
  const open = path === "/jobs" || path.startsWith("/jobs/")
  if (loading) return null
  if (member || (inApp && !open))
    return (
      <>
        <FirstRun />
        <AppShell>
          <Outlet />
        </AppShell>
      </>
    )
  if (!open) return <Navigate to="/sign-in" replace />
  return (
    <div className="flex h-svh flex-col">
      <SiteHeader>
        <Button variant="ghost" render={<Link to="/sign-in" />}>
          Sign in
        </Button>
      </SiteHeader>
      <Outlet />
      <SiteFooter />
    </div>
  )
}

export const Route = createFileRoute("/_app")({ component: AppLayout })
