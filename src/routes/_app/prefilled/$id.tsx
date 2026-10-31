import type { Id } from "@convex/_generated/dataModel"
import { createFileRoute } from "@tanstack/react-router"

import { PrefilledPage } from "@/features/prefilled/prefilled"

const Page = () => {
  const id = Route.useParams().id as Id<"prefills">
  // A fresh page per application, so one's error doesn't show on the next.
  return <PrefilledPage key={id} id={id} />
}

export const Route = createFileRoute("/_app/prefilled/$id")({ component: Page })
