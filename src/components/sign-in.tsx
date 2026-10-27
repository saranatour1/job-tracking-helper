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
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { api } from "../../convex/_generated/api"

type Result =
  | ReturnType<ReturnType<typeof useSignInWithUsernamePassword>["signIn"]>
  | ReturnType<ReturnType<typeof useSignUpWithUsernamePassword>["signUp"]>
type UserError = Extract<Awaited<Result>, { status: "error" }>["userError"]

const messages: Record<UserError["error"] | OauthFlowError["error"], string> = {
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

export function SignIn() {
  const { signIn, pending: signingIn } = useSignInWithUsernamePassword(api.auth)
  const { signUp, pending: signingUp } = useSignUpWithUsernamePassword(api.auth)
  const [mode, setMode] = useState<"signIn" | "signUp">("signIn")
  const { signIn: signInWithGoogle } = useSignInWithGoogle(api.auth)
  const { signIn: signInWithGithub } = useSignInWithGithub(api.auth)
  const { signIn: signInAnonymously } = useSignInAnonymously(api.auth)
  const { flowError } = useOauth()
  const [formError, setError] = useState<string>()
  const error = formError ?? (flowError ? messages[flowError.error] : undefined)
  const oauth = [
    { label: "Continue with Google", signIn: signInWithGoogle },
    { label: "Continue with GitHub", signIn: signInWithGithub },
  ]

  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <form
        className="grid w-full max-w-xs gap-4"
        onSubmit={async (e) => {
          e.preventDefault()
          const data = new FormData(e.currentTarget)
          const credentials = {
            username: data.get("username") as string,
            password: data.get("password") as string,
          }
          const result = await (mode === "signIn" ? signIn : signUp)(credentials)
          setError(result.status === "error" ? messages[result.userError.error] : undefined)
        }}
      >
        <h1 className="text-lg font-medium">
          {mode === "signIn" ? "Sign in" : "Create an account"}
        </h1>
        <div className="grid gap-1.5">
          <Label htmlFor="username">Username</Label>
          <Input id="username" name="username" autoComplete="username" required />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete={mode === "signIn" ? "current-password" : "new-password"}
            required
          />
        </div>
        {error && (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        )}
        <Button type="submit" disabled={signingIn || signingUp}>
          {mode === "signIn" ? "Sign in" : "Sign up"}
        </Button>
        {oauth.map(({ label, signIn }) => (
          <Button
            key={label}
            type="button"
            variant="outline"
            onClick={async () => {
              const result = await signIn()
              setError(result.status === "error" ? messages[result.userError.error] : undefined)
            }}
          >
            {label}
          </Button>
        ))}
        <Button
          type="button"
          variant="ghost"
          onClick={() => signInAnonymously().catch(() => setError(messages.OTHER_ERROR))}
        >
          Continue as guest
        </Button>
        <Button
          type="button"
          variant="link"
          onClick={() => {
            setMode(mode === "signIn" ? "signUp" : "signIn")
            setError(undefined)
          }}
        >
          {mode === "signIn" ? "Need an account? Sign up" : "Have an account? Sign in"}
        </Button>
      </form>
    </main>
  )
}
