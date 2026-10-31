import type { Id } from "@convex/_generated/dataModel"
import { createFileRoute } from "@tanstack/react-router"

import { PrefilledPage } from "@/features/prefilled/prefilled"

const Page = () => <PrefilledPage id={Route.useParams().id as Id<"prefills">} />

export const Route = createFileRoute("/_app/prefilled/$id")({ component: Page })
