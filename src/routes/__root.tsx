import { HeadContent, ScriptOnce, Scripts, createRootRoute } from "@tanstack/react-router"

import { ConvexAuthProvider } from "@convex-dev/auth/react"
import { Databuddy } from "@databuddy/sdk/react"
import { ConvexReactClient } from "convex/react"
import { ConvexQueryCacheProvider } from "convex-helpers/react/cache/provider"
import { api } from "@/lib/api"
import { themeScript } from "@/features/shell/theme"
import appCss from "@/styles.css?url"

const convexUrl: string | undefined = import.meta.env.VITE_CONVEX_URL
if (!convexUrl) {
  throw new Error("VITE_CONVEX_URL is not set. Run `npx convex dev` to write it to .env.local.")
}
const convex = new ConvexReactClient(convexUrl)
const authApi = { refreshSession: api.auth.refreshSession, signOut: api.auth.signOut }

const RootDocument = ({ children }: { children: React.ReactNode }) => (
  // The theme script sets the html class before hydration, so React must not flag the mismatch.
  <html lang="en" suppressHydrationWarning>
    <head>
      <ScriptOnce>{themeScript}</ScriptOnce>
      <HeadContent />
    </head>
    <body>
      <ConvexAuthProvider client={convex} api={authApi}>
        {/* Keeps each query's data for a few minutes after its page closes, so going back
            to a page shows it right away instead of loading again. */}
        <ConvexQueryCacheProvider>{children}</ConvexQueryCacheProvider>
      </ConvexAuthProvider>
      <Databuddy
        clientId="8ed4f691-f76a-400e-b1fb-a9233678940e"
        trackHashChanges={true}
        trackAttributes={true}
        trackOutgoingLinks={true}
        trackWebVitals={true}
        replay
      />
      <Scripts />
    </body>
  </html>
)

export const Route = createRootRoute({
  head: () => ({
    meta: [
      {
        charSet: "utf-8",
      },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      },
      {
        title: "Job Tracking Helper",
      },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
    ],
  }),
  notFoundComponent: () => (
    <main className="container mx-auto p-4 pt-16">
      <h1>404</h1>
      <p>The requested page could not be found.</p>
    </main>
  ),
  shellComponent: RootDocument,
})
