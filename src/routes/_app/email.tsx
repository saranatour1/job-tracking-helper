import { createFileRoute } from "@tanstack/react-router"

import { Mailbox, mailSearch } from "@/features/mail/mailbox"

export const Route = createFileRoute("/_app/email")({
  component: Mailbox,
  validateSearch: mailSearch,
})
