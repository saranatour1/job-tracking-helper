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
import { api } from "@/lib/api"
import { Link } from "@tanstack/react-router"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

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

export const SignIn = ({ mode }: { mode: "signIn" | "signUp" }) => {
  const [formError, setFormError] = useState<string>()
  const { signIn, pending: signingIn } = useSignInWithUsernamePassword(api.auth)
  const { signUp, pending: signingUp } = useSignUpWithUsernamePassword(api.auth)
  const { signIn: signInWithGoogle } = useSignInWithGoogle(api.auth)
  const { signIn: signInWithGithub } = useSignInWithGithub(api.auth)
  const { signIn: signInAnonymously } = useSignInAnonymously(api.auth)
  const { flowError } = useOauth()

  const error = formError ?? (flowError ? messages[flowError.error] : undefined)
  const report = (outcome: Outcome) =>
    setFormError(outcome.status === "error" ? messages[outcome.userError.error] : undefined)
  const oauth = [
    ...(import.meta.env.DEV ? [{ label: "Continue with Google", signIn: signInWithGoogle }] : []),
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
          report(await (mode === "signIn" ? signIn : signUp)(credentials))
        }}
      >
        <h1 className="font-heading text-lg font-medium">
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
            onClick={async () => report(await signIn())}
          >
            {label}
          </Button>
        ))}
        {import.meta.env.DEV && (
          <>
            <Button
              type="button"
              variant="ghost"
              onClick={() => signInAnonymously().catch(() => setFormError(messages.OTHER_ERROR))}
            >
              Continue as guest
            </Button>
            <Button
              variant="link"
              render={<Link to={mode === "signIn" ? "/sign-up" : "/sign-in"} />}
            >
              {mode === "signIn" ? "Need an account? Sign up" : "Have an account? Sign in"}
            </Button>
          </>
        )}
        <p className="text-muted-foreground text-center text-xs text-pretty">
          By continuing, you agree to the{" "}
          <Link to="/terms" className="underline underline-offset-4">
            Terms
          </Link>{" "}
          and{" "}
          <Link to="/privacy" className="underline underline-offset-4">
            Privacy Policy
          </Link>
          .
        </p>
      </form>
    </main>
  )
}
