import { api } from "@/lib/api"
import { Link, Navigate, Outlet, createFileRoute, useRouterState } from "@tanstack/react-router"
import { useQuery } from "convex-helpers/react/cache/hooks"

import { Button } from "@/components/ui/button"
import { SiteFooter, SiteHeader } from "@/features/landing/site-frame"
import { AppShell } from "@/features/shell/app-shell"
import { pageBody, RowSkeletons } from "@/features/shell/page-body"
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
  // Where this layout is, not where a navigation is going: leaving Jobs for Sign in still renders
  // it for a moment, and judging by the new address it would send a visitor to sign in again,
  // dropping where to come back to.
  const path = useRouterState({
    select: (s) => (s.resolvedLocation ?? s.location).pathname,
  })
  const open = path === "/jobs" || path.startsWith("/jobs/")
  // The server renders this too, so a page shows something before its scripts load. It can't be the
  // real frame yet: that depends on who this is. Jobs and a role's page go ahead in the visitor's
  // frame, since crawlers read them from here. Members get their sidebar next.
  if (loading && !open)
    return (
      <div aria-busy="true" className={pageBody}>
        <RowSkeletons />
      </div>
    )
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
