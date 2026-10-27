import { components, internal } from "./_generated/api"
import { setupConvexAuth } from "@convex-dev/auth/server"
import { setupAnonymous } from "@convex-dev/auth/methods/anonymous/server"
import { setupGithub } from "@convex-dev/auth/methods/github/server"
import { setupGoogle } from "@convex-dev/auth/methods/google/server"
import { setupUsernamePassword } from "@convex-dev/auth/methods/username-password/server"
import { v } from "convex/values"
import { query } from "./_generated/server"

const siteUrl = process.env.SITE_URL
if (!siteUrl) {
  throw new Error("SITE_URL is not set. Run `npx convex env set SITE_URL=http://localhost:3000`.")
}
const userCallbacks = { createUser: internal.users.createUser }

const auth = setupConvexAuth({ component: components.auth })
export const { signOut, refreshSession, isAuthenticated } = auth

export const { signUpWithUsernamePassword, signInWithUsernamePassword } = setupUsernamePassword(
  auth,
  {
    component: components.authPassword,
    usernameComponent: components.authUsername,
  }
).attachUserCallbacks(userCallbacks)

export const { startSignInWithGoogle, completeSignInWithGoogle } = setupGoogle(auth, {
  component: components.authGoogle,
  allowedRedirectOrigins: [siteUrl],
}).attachUserCallbacks(userCallbacks)

export const { startSignInWithGithub, completeSignInWithGithub } = setupGithub(auth, {
  component: components.authGithub,
  allowedRedirectOrigins: [siteUrl],
}).attachUserCallbacks(userCallbacks)

export const { signInAnonymously } = setupAnonymous(auth, {
  component: components.authAnonymous,
}).attachUserCallbacks(userCallbacks)

// scripts/dev.sh sets "disabled" so dev can push without real OAuth apps.
const configured = (...names: string[]) =>
  names.every((name) => ![undefined, "", "disabled"].includes(process.env[name]))

export const oauthProviders = query({
  args: {},
  returns: v.object({ google: v.boolean(), github: v.boolean() }),
  handler: () => ({
    google: configured("AUTH_GOOGLE_CLIENT_ID", "AUTH_GOOGLE_CLIENT_SECRET"),
    github: configured("AUTH_GITHUB_CLIENT_ID", "AUTH_GITHUB_CLIENT_SECRET"),
  }),
})
