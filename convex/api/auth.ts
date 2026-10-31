// Registers `api.api.auth.*` and `internal.api.auth.*`. Definitions live in ../features/auth.
import { authApi } from "../features/auth"

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
  createUser,
} = authApi
