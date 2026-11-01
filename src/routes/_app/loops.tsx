import { createFileRoute } from "@tanstack/react-router"

import { Loops } from "@/features/loops/loops"
import { loopsSearch } from "@/features/loops/search"

export const Route = createFileRoute("/_app/loops")({
  component: Loops,
  validateSearch: loopsSearch,
})
