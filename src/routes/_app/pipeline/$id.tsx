import { createFileRoute } from "@tanstack/react-router"

import { ApplicationDetail } from "@/features/tracker/application"

const ApplicationPage = () => {
  const { id } = Route.useParams()
  // Keyed so local edits reset when you open another application.
  return <ApplicationDetail key={id} id={id} />
}

export const Route = createFileRoute("/_app/pipeline/$id")({ component: ApplicationPage })
