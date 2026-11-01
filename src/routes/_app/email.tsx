import { createFileRoute } from "@tanstack/react-router"

import { Mailbox } from "@/features/mail/mailbox"
import { mailSearch } from "@/features/mail/search"

export const Route = createFileRoute("/_app/email")({
  component: Mailbox,
  validateSearch: mailSearch,
})
