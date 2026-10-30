import { createFileRoute } from "@tanstack/react-router"

import { ApplicationDetail } from "@/features/tracker/application"
import { ConvexSource } from "@/features/tracker/source"

const ApplicationPage = () => {
  const { id } = Route.useParams()
  // Keyed so local edits reset when you open another application. A sample application
  // (APP-21) keeps the sample data.
  const detail = <ApplicationDetail key={id} id={id} />
  return id.startsWith("APP-") ? detail : <ConvexSource>{detail}</ConvexSource>
}

export const Route = createFileRoute("/_app/pipeline/$id")({ component: ApplicationPage })
