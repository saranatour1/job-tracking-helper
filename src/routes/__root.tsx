import { HeadContent, Scripts, createRootRoute } from "@tanstack/react-router"

import { ConvexAuthProvider } from "@convex-dev/auth/react"
import { ConvexReactClient } from "convex/react"
import { api } from "@convex/_generated/api"
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
      <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      <HeadContent />
    </head>
    <body>
      <ConvexAuthProvider client={convex} api={authApi}>
        {children}
      </ConvexAuthProvider>
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
