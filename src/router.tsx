import { createRouter as createTanStackRouter } from "@tanstack/react-router"
import { onAuthChange } from "@/lib/convex"
import { registerSiteTools } from "@/lib/web-mcp"
import { routeTree } from "@/routeTree.gen"

export const getRouter = () => {
  const router = createTanStackRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0,
  })
  // The server builds a router per request. Only a page in a browser has tools to offer.
  if (typeof document !== "undefined") {
    void registerSiteTools(router.history.push)
    // Jobs reads over HTTP as whoever is signed in, so a new sign-in reads it again.
    onAuthChange(() => void router.invalidate({ filter: (m) => m.routeId === "/_app/jobs/" }))
  }
  return router
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
