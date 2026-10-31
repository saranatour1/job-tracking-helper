import { createFileRoute } from "@tanstack/react-router"

import { PrefilledList } from "@/features/prefilled/prefilled"

export const Route = createFileRoute("/_app/prefilled/")({ component: PrefilledList })
