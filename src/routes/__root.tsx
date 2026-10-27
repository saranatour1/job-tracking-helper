import { HeadContent, Scripts, createRootRoute } from "@tanstack/react-router"

import { SignIn } from "@/features/auth/sign-in"
import { AppShell } from "@/features/shell/app-shell"
import { ConvexAuthProvider } from "@convex-dev/auth/react"
import { Authenticated, ConvexReactClient, Unauthenticated } from "convex/react"
import { api } from "../../convex/_generated/api"
import appCss from "../styles.css?url"

const convexUrl: string | undefined = import.meta.env.VITE_CONVEX_URL
if (!convexUrl) {
  throw new Error("VITE_CONVEX_URL is not set. Run `npx convex dev` to write it to .env.local.")
}
const convex = new ConvexReactClient(convexUrl)
const authApi = { refreshSession: api.auth.refreshSession, signOut: api.auth.signOut }

const RootDocument = ({ children }: { children: React.ReactNode }) => (
  <html lang="en">
    <head>
      <HeadContent />
    </head>
    <body>
      <ConvexAuthProvider client={convex} api={authApi}>
        <Authenticated>
          <AppShell>{children}</AppShell>
        </Authenticated>
        <Unauthenticated>
          <SignIn />
        </Unauthenticated>
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
