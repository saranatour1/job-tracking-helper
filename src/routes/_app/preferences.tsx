import { createFileRoute } from "@tanstack/react-router"

import { Preferences } from "@/features/preferences/preferences"

export const Route = createFileRoute("/_app/preferences")({ component: Preferences })
