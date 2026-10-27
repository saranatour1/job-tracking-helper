import {
  useSignInWithUsernamePassword,
  useSignUpWithUsernamePassword,
} from "@convex-dev/auth/methods/username-password/react"
import { useSignInAnonymously } from "@convex-dev/auth/methods/anonymous/react"
import { useSignInWithGithub } from "@convex-dev/auth/methods/github/react"
import {
  useOauth,
  useSignInWithGoogle,
  type OauthFlowError,
} from "@convex-dev/auth/methods/google/react"
import { useQuery } from "convex/react"
import { useState } from "react"

import { api } from "../../../convex/_generated/api"

type Mode = "signIn" | "signUp"
type Outcome = Awaited<
  | ReturnType<ReturnType<typeof useSignInWithUsernamePassword>["signIn"]>
  | ReturnType<ReturnType<typeof useSignUpWithUsernamePassword>["signUp"]>
  | ReturnType<ReturnType<typeof useSignInWithGoogle>["signIn"]>
>
type ErrorCode =
  | Extract<Outcome, { status: "error" }>["userError"]["error"]
  | OauthFlowError["error"]

const messages: Record<ErrorCode, string> = {
  INVALID_CREDENTIALS: "Wrong username or password.",
  USER_NOT_FOUND: "Wrong username or password.",
  RATE_LIMITED: "Too many attempts. Try again in a minute.",
  PASSWORD_TOO_SHORT: "Password is too short.",
  PASSWORD_TOO_LONG: "Password is too long.",
  PASSWORD_TOO_COMMON: "Password is too common.",
  PASSWORD_HAS_SURROUNDING_WHITESPACE: "Password can't start or end with a space.",
  USERNAME_TOO_SHORT: "Username is too short.",
  USERNAME_HAS_SURROUNDING_WHITESPACE: "Username can't start or end with a space.",
  USERNAME_HAS_INVALID_CHARACTERS: "Username has invalid characters.",
  USERNAME_TAKEN: "That username is taken.",
  ACCESS_DENIED: "Sign-in was cancelled.",
  EXPIRED: "Sign-in took too long. Try again.",
  INVALID_FLOW: "Sign-in didn't finish. Try again.",
  REJECTED: "Sign-in was rejected.",
  OTHER_ERROR: "Something went wrong. Try again.",
}

export const useSignIn = () => {
  const [mode, setMode] = useState<Mode>("signIn")
  const [formError, setFormError] = useState<string>()
  const { signIn, pending: signingIn } = useSignInWithUsernamePassword(api.auth)
  const { signUp, pending: signingUp } = useSignUpWithUsernamePassword(api.auth)
  const { signIn: signInWithGoogle } = useSignInWithGoogle(api.auth)
  const { signIn: signInWithGithub } = useSignInWithGithub(api.auth)
  const { signIn: signInAnonymously } = useSignInAnonymously(api.auth)
  const { flowError } = useOauth()
  const providers = useQuery(api.auth.oauthProviders)

  const report = (outcome: Outcome) =>
    setFormError(outcome.status === "error" ? messages[outcome.userError.error] : undefined)

  const submitCredentials = async (data: FormData) => {
    const credentials = {
      username: data.get("username") as string,
      password: data.get("password") as string,
    }
    report(await (mode === "signIn" ? signIn : signUp)(credentials))
  }

  const oauth = [
    { label: "Continue with Google", signIn: signInWithGoogle, enabled: providers?.google },
    { label: "Continue with GitHub", signIn: signInWithGithub, enabled: providers?.github },
  ]
    .filter((provider) => provider.enabled)
    .map(({ label, signIn }) => ({ label, start: async () => report(await signIn()) }))

  const continueAsGuest = () => signInAnonymously().catch(() => setFormError(messages.OTHER_ERROR))

  const toggleMode = () => {
    setMode(mode === "signIn" ? "signUp" : "signIn")
    setFormError(undefined)
  }

  return {
    mode,
    toggleMode,
    pending: signingIn || signingUp,
    error: formError ?? (flowError ? messages[flowError.error] : undefined),
    submitCredentials,
    oauth,
    continueAsGuest,
  }
}
