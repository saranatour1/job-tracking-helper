import { createFileRoute } from "@tanstack/react-router"

import { useApplicationRoutes, useRouteId } from "@/lib/route-ids"
import { ApplicationDetail } from "@/features/tracker/application"
import { ConvexSource } from "@/features/tracker/source"

const ApplicationPage = () => {
  const { id: text } = Route.useParams()
  const id = useRouteId(useApplicationRoutes(), text) ?? text
  // Keyed so local edits reset when you open another application. A sample application
  // (APP-21) keeps the sample data.
  const detail = <ApplicationDetail key={id} id={id} />
  return id.startsWith("APP-") ? detail : <ConvexSource>{detail}</ConvexSource>
}

export const Route = createFileRoute("/_app/pipeline/$id")({ component: ApplicationPage })
