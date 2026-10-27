import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useSignIn } from "./use-sign-in"

export const SignIn = () => {
  const { mode, toggleMode, pending, error, submitCredentials, oauth, continueAsGuest } =
    useSignIn()

  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <form
        className="grid w-full max-w-xs gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          void submitCredentials(new FormData(e.currentTarget))
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
        <Button type="submit" disabled={pending}>
          {mode === "signIn" ? "Sign in" : "Sign up"}
        </Button>
        {oauth.map(({ label, start }) => (
          <Button key={label} type="button" variant="outline" onClick={() => void start()}>
            {label}
          </Button>
        ))}
        <Button type="button" variant="ghost" onClick={() => void continueAsGuest()}>
          Continue as guest
        </Button>
        <Button type="button" variant="link" onClick={toggleMode}>
          {mode === "signIn" ? "Need an account? Sign up" : "Have an account? Sign in"}
        </Button>
      </form>
    </main>
  )
}
