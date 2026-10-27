import { components } from "./_generated/api"
import { setupConvexAuth } from "@convex-dev/auth/server"

const auth = setupConvexAuth({ component: components.auth })
export const { signOut, refreshSession, isAuthenticated } = auth

// TODO Set up a login provider. For example:
// export const { signUpWithUsernamePassword, signInWithUsernamePassword } =
//   setupUsernamePassword(auth, {
//     component: components.authPassword,
//     usernameComponent: components.authUsername,
//   }).attachUserCallbacks({ createUser: internal.users.createUser });
