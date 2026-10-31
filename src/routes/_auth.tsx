import { Navigate, Outlet, createFileRoute } from "@tanstack/react-router"
import { Authenticated, Unauthenticated } from "convex/react"

const AuthLayout = () => (
  <>
    <Unauthenticated>
      <Outlet />
    </Unauthenticated>
    <Authenticated>
      <Navigate to="/pipeline" replace />
    </Authenticated>
  </>
)

export const Route = createFileRoute("/_auth")({ component: AuthLayout })
