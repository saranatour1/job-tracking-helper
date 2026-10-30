import { createFileRoute } from "@tanstack/react-router"

import { Activity } from "@/features/activity/activity"

export const Route = createFileRoute("/_app/activity")({ component: Activity })
