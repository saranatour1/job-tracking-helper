import { createFileRoute } from "@tanstack/react-router"

import { ConvexSource } from "@/features/tracker/source"
import { Views } from "@/features/tracker/views"

const Page = () => (
  <ConvexSource>
    <Views />
  </ConvexSource>
)

export const Route = createFileRoute("/_app/views/")({ component: Page })
