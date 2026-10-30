import { createFileRoute } from "@tanstack/react-router"

import { Resume } from "@/features/preferences/resume"

export const Route = createFileRoute("/_app/resume")({ component: Resume })
