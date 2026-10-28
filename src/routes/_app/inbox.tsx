import { createFileRoute } from "@tanstack/react-router"

import { Inbox } from "@/features/tracker/inbox"

export const Route = createFileRoute("/_app/inbox")({ component: Inbox })
