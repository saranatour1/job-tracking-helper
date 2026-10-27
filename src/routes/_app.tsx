import { Navigate, Outlet, createFileRoute } from "@tanstack/react-router"
import { Authenticated, Unauthenticated } from "convex/react"

import { AppShell } from "@/features/shell/app-shell"

const AppLayout = () => (
  <>
    <Authenticated>
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
