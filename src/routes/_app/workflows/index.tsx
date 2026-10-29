import { createFileRoute } from "@tanstack/react-router"

import { Workflows } from "@/features/workflows/workflows"

export const Route = createFileRoute("/_app/workflows/")({ component: Workflows })
