import { createFileRoute } from "@tanstack/react-router"

import { Inbox, inboxSearch } from "@/features/inbox/inbox"

export const Route = createFileRoute("/_app/inbox")({
  component: Inbox,
  validateSearch: inboxSearch,
})
