import { createFileRoute } from "@tanstack/react-router"

import { usePrefillRoutes, useRouteId } from "@/lib/route-ids"
import { PrefilledMissing, PrefilledPage } from "@/features/prefilled/prefilled"

const Page = () => {
  const routes = usePrefillRoutes()
  const id = useRouteId(routes, Route.useParams().id)
  if (!routes.loaded) return null
  // A fresh page per application, so one's error doesn't show on the next.
  return id ? <PrefilledPage key={id} id={id} /> : <PrefilledMissing />
}

export const Route = createFileRoute("/_app/prefilled/$id")({ component: Page })
