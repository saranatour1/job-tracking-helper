import { createFileRoute } from "@tanstack/react-router"

import { Applications } from "@/features/applications/applications"

export const Route = createFileRoute("/_app/")({ component: Applications })
