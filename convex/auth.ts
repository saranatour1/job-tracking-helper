// Registers `api.auth.*` and `internal.auth.*`. Definitions live in ./api/features/auth.
import { authApi } from "./api/features/auth"

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
