import { api } from "@/lib/api"
import { Link, Navigate, Outlet, createFileRoute, useRouterState } from "@tanstack/react-router"
import { useQuery } from "convex-helpers/react/cache/hooks"

import { Button } from "@/components/ui/button"
import { SiteFooter, SiteHeader } from "@/features/landing/site-frame"
import { pageBody, RowSkeletons } from "@/features/shell/page-body"
import { useAccess } from "@/hooks/use-access"
import { usePauseWhenAway } from "@/hooks/use-away"
import { lazy, Suspense } from "react"

// Only someone signed in sees the sidebar and its dialogs, so visitors to Jobs don't download them.
const AppShell = lazy(() =>
  import("@/features/shell/app-shell").then((shell) => ({ default: shell.AppShell }))
)

// New accounts start on Preferences. Saving or "Skip for now" there stops this.
const FirstRun = () => {
  const me = useQuery(api.users.me)
  const path = useRouterState({ select: (s) => s.location.pathname })
  return me && !me.onboarded && path === "/pipeline" ? <Navigate to="/preferences" replace /> : null
}

// Jobs sits under this layout so members keep their sidebar there, but it's open to anyone.
const AppLayout = () => {
  const { loading, member, inApp } = useAccess()
  usePauseWhenAway()
  // The routes this layout is rendering right now, not an address: arriving from Home or
  // leaving for Sign in, the address moves a render before the routes do.
  const open = useRouterState({
    select: (s) => s.matches.some((m) => m.routeId.startsWith("/_app/jobs")),
  })
  // The server renders this too, so a page shows something before its scripts load. It can't be the
  // real frame yet: that depends on who this is. Jobs and a role's page go ahead in the visitor's
  // frame, since crawlers read them from here. Members get their sidebar next.
  const busy = (
    <div aria-busy="true" className={pageBody}>
      <RowSkeletons />
    </div>
  )
  if (loading && !open) return busy
  if (member || (inApp && !open))
    return (
      <Suspense fallback={busy}>
        <FirstRun />
        <AppShell>
          <Outlet />
        </AppShell>
      </Suspense>
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
