import { Navigate, Outlet, createFileRoute, useSearch } from "@tanstack/react-router"

import { useAccess } from "@/hooks/use-access"

const AuthLayout = () => {
  const { loading, inApp } = useAccess()
  const { redirect } = useSearch({ strict: false }) as { redirect?: string }
  if (loading) return null
  if (!inApp) return <Outlet />
  // `href` wins over `to`, so a redirect lands on the exact page and search it came from.
  return <Navigate to="/pipeline" {...(redirect && { href: redirect })} replace />
}

export const Route = createFileRoute("/_auth")({ component: AuthLayout })
