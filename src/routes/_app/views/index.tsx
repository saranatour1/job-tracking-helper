import { createFileRoute } from "@tanstack/react-router"

import { Views } from "@/features/tracker/views"

export const Route = createFileRoute("/_app/views/")({ component: Views })
