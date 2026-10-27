// Public module: Convex registers what this file exports as `api.auth.*`, and the
// Convex Auth React hooks take `api.auth` whole. Definitions live in ./features/auth.
import { methodsApi } from "./features/auth/methods"
import { providersApi } from "./features/auth/providers"

export const {
  signOut,
  refreshSession,
  isAuthenticated,
  signUpWithUsernamePassword,
  signInWithUsernamePassword,
  startSignInWithGoogle,
  completeSignInWithGoogle,
  startSignInWithGithub,
  completeSignInWithGithub,
  signInAnonymously,
} = methodsApi
export const { oauthProviders } = providersApi
