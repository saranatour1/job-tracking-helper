import { createFileRoute } from "@tanstack/react-router"

import { Connect } from "@/features/account/connect"

export const Route = createFileRoute("/connect")({
  validateSearch: (search: Record<string, unknown>) => ({
    request: typeof search.request === "string" ? search.request : undefined,
  }),
  // Approving is one click, so nobody else's page gets to frame this one over a decoy.
  headers: () => ({ "Content-Security-Policy": "frame-ancestors 'none'" }),
  component: () => <Connect request={Route.useSearch().request} />,
})
