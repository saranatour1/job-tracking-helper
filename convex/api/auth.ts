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
  onGithubSignIn,
} = authApi
