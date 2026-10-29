import { createFileRoute } from "@tanstack/react-router"

import { ApplicationDetail } from "@/features/tracker/application"
import { ConvexSource } from "@/features/tracker/source"

const ApplicationPage = () => {
  const { id } = Route.useParams()
  // Keyed so local edits reset when you open another application. Goals and Views still
  // link to sample applications (APP-21), which keep the sample data.
  const detail = <ApplicationDetail key={id} id={id} />
  return id.startsWith("APP-") ? detail : <ConvexSource>{detail}</ConvexSource>
}

export const Route = createFileRoute("/_app/pipeline/$id")({ component: ApplicationPage })
