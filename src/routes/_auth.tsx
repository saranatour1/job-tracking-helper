import { Navigate, Outlet, createFileRoute } from "@tanstack/react-router"

import { useAccess } from "@/hooks/use-access"

const AuthLayout = () => {
  const { loading, inApp } = useAccess()
  if (loading) return null
  return inApp ? <Navigate to="/pipeline" replace /> : <Outlet />
}

export const Route = createFileRoute("/_auth")({ component: AuthLayout })
