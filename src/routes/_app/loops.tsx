import { createFileRoute } from "@tanstack/react-router"

import { Loops, loopsSearch } from "@/features/loops/loops"

export const Route = createFileRoute("/_app/loops")({
  component: Loops,
  validateSearch: loopsSearch,
})
