import { createFileRoute } from "@tanstack/react-router"

import { Contacts } from "@/features/contacts/contacts"

export const Route = createFileRoute("/_app/contacts")({ component: Contacts })
