import { createRouter as createTanStackRouter } from "@tanstack/react-router"
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
  if (typeof document !== "undefined") void registerSiteTools(router.history.push)
  return router
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
