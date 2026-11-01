import { createFileRoute } from "@tanstack/react-router"

import { Inbox } from "@/features/inbox/inbox"
import { inboxSearch } from "@/features/inbox/search"

export const Route = createFileRoute("/_app/inbox")({
  component: Inbox,
  validateSearch: inboxSearch,
})
