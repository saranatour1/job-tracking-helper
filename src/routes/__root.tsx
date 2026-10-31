import {
  HeadContent,
  ScriptOnce,
  Scripts,
  createRootRoute,
  useRouterState,
} from "@tanstack/react-router"

import { ConvexAuthProvider } from "@convex-dev/auth/react"
import { Databuddy } from "@databuddy/sdk/react"
import { ConvexReactClient } from "convex/react"
import { ConvexQueryCacheProvider } from "convex-helpers/react/cache/provider"
import { api } from "@/lib/api"
import { themeScript } from "@/features/shell/theme"
import { site } from "@/lib/seo"
import appCss from "@/styles.css?url"

const convexUrl: string | undefined = import.meta.env.VITE_CONVEX_URL
if (!convexUrl) {
  throw new Error("VITE_CONVEX_URL is not set. Run `npx convex dev` to write it to .env.local.")
}
const convex = new ConvexReactClient(convexUrl)
const authApi = { refreshSession: api.auth.refreshSession, signOut: api.auth.signOut }
const queryCacheMs = 60 * 60 * 1000

const RootDocument = ({ children }: { children: React.ReactNode }) => {
  const path = useRouterState({ select: (s) => s.location.pathname })
  return (
    // The theme script sets the html class before hydration, so React must not flag the mismatch.
    <html lang="en" suppressHydrationWarning>
      <head>
        <ScriptOnce>{themeScript}</ScriptOnce>
        <HeadContent />
      </head>
      <body>
        <ConvexAuthProvider client={convex} api={authApi}>
          {/* Keeps each query live for an hour after its page closes, so going back to a page
            shows current data right away instead of loading again. */}
          <ConvexQueryCacheProvider expiration={queryCacheMs}>{children}</ConvexQueryCacheProvider>
        </ConvexAuthProvider>
        {/* Booking guests never agreed to analytics, so their pages stay out of it. */}
        {!path.startsWith("/book/") && (
          <Databuddy
            clientId="8ed4f691-f76a-400e-b1fb-a9233678940e"
            trackHashChanges={true}
            trackAttributes={true}
            trackOutgoingLinks={true}
            trackWebVitals={true}
            replay
          />
        )}
        <Scripts />
      </body>
    </html>
  )
}

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
        title: site.name,
      },
      // Private unless a route says otherwise. See publicHead in lib/seo.ts.
      {
        name: "robots",
        content: "noindex, nofollow",
      },
      {
        name: "author",
        content: site.author,
      },
      {
        name: "theme-color",
        content: "#432dd7",
      },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      {
        rel: "icon",
        href: "/logo.svg",
        type: "image/svg+xml",
      },
      {
        rel: "icon",
        href: "/favicon.ico",
        sizes: "32x32",
      },
      {
        rel: "apple-touch-icon",
        href: "/apple-touch-icon.png",
      },
      {
        rel: "manifest",
        href: "/site.webmanifest",
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
