import { createFileRoute } from "@tanstack/react-router"

import { Preferences } from "@/features/preferences/preferences"
import { preferencesSearch } from "@/features/preferences/search"

export const Route = createFileRoute("/_app/preferences")({
  component: Preferences,
  validateSearch: preferencesSearch,
})
