import { setupConvexAuth } from "@convex-dev/auth/server"
import { setupAnonymous } from "@convex-dev/auth/methods/anonymous/server"
import { setupGithub } from "@convex-dev/auth/methods/github/server"
import { setupGoogle } from "@convex-dev/auth/methods/google/server"
import { setupUsernamePassword } from "@convex-dev/auth/methods/username-password/server"
import { components, internal } from "../../../_generated/api"

const siteUrl = process.env.SITE_URL
if (!siteUrl) {
  throw new Error(
    "SITE_URL is not set. Run `pnpm exec convex env set SITE_URL=http://localhost:3000`."
  )
}
const userCallbacks = { createUser: internal.auth.createUser }

const auth = setupConvexAuth({ component: components.auth })

const password = setupUsernamePassword(auth, {
  component: components.authPassword,
  usernameComponent: components.authUsername,
}).attachUserCallbacks(userCallbacks)

const google = setupGoogle(auth, {
  component: components.authGoogle,
  allowedRedirectOrigins: [siteUrl],
}).attachUserCallbacks(userCallbacks)

const github = setupGithub(auth, {
  component: components.authGithub,
  allowedRedirectOrigins: [siteUrl],
}).attachUserCallbacks(userCallbacks)

const anonymous = setupAnonymous(auth, {
  component: components.authAnonymous,
}).attachUserCallbacks(userCallbacks)

export const publicApi = {
  signOut: auth.signOut,
  refreshSession: auth.refreshSession,
  isAuthenticated: auth.isAuthenticated,
  signUpWithUsernamePassword: password.signUpWithUsernamePassword,
  signInWithUsernamePassword: password.signInWithUsernamePassword,
  startSignInWithGoogle: google.startSignInWithGoogle,
  completeSignInWithGoogle: google.completeSignInWithGoogle,
  startSignInWithGithub: github.startSignInWithGithub,
  completeSignInWithGithub: github.completeSignInWithGithub,
  signInAnonymously: anonymous.signInAnonymously,
}
