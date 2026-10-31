import { Authenticated, AuthLoading, Unauthenticated, useAction } from "convex/react"
import { useQuery } from "convex-helpers/react/cache/hooks"
import { startTransition, useActionState } from "react"

import { Button } from "@/components/ui/button"
import { messageOf } from "@/features/account/settings"
import { SignIn } from "@/features/auth/sign-in"
import { mcp } from "@/lib/api"

const Note = ({ children }: { children: React.ReactNode }) => (
  <p className="text-muted-foreground text-sm">{children}</p>
)

// A custom scheme like cursor:// has no host, so it's named by its scheme. Any program on this
// computer can listen on localhost, so that gets said.
const destinationOf = (uri: string) => {
  const { host, hostname, protocol } = new URL(uri)
  if (["localhost", "127.0.0.1", "[::1]"].includes(hostname))
    return `a program on this computer (${host})`
  return host || protocol.replace(":", "")
}

const Decide = ({ requestId }: { requestId: string }) => {
  const request = useQuery(mcp.getAuthRequest, { requestId })
  const authorize = useAction(mcp.authorize)
  const [problem, decide, deciding] = useActionState(
    async (_: string | undefined, approve: boolean) => {
      try {
        const { redirectUrl } = await authorize({ requestId, approve })
        if (redirectUrl) window.location.assign(redirectUrl)
      } catch (cause) {
        return messageOf(cause)
      }
    },
    undefined
  )

  if (request === undefined) return null
  if (request === null || request.status !== "pending")
    return <Note>This request has ended. Start again from your agent.</Note>
  return (
    <>
      <p className="text-sm">
        <strong className="font-medium">{request.clientName || "An unnamed agent"}</strong> (name
        not verified) wants to use your Job Tracking Helper account. Agents pick their own names, so
        only allow this if you just started it.
      </p>
      <div className="grid gap-1.5">
        <p className="text-sm font-medium">It will be able to:</p>
        <ul className="text-muted-foreground list-disc ps-4 text-sm">
          {request.scopes.map((scope) => (
            <li key={scope.name}>{scope.description}</li>
          ))}
        </ul>
      </div>
      {request.redirectUri && (
        <p className="text-muted-foreground text-sm" title={request.redirectUri}>
          After you decide, you go back to {destinationOf(request.redirectUri)}.
        </p>
      )}
      <Note>You can disconnect it any time under Account.</Note>
      {problem && (
        <p role="alert" className="text-destructive text-sm">
          {problem}
        </p>
      )}
      <div className="flex gap-2">
        <Button disabled={deciding} onClick={() => startTransition(() => decide(true))}>
          Allow
        </Button>
        <Button
          variant="outline"
          disabled={deciding}
          onClick={() => startTransition(() => decide(false))}
        >
          Deny
        </Button>
      </div>
    </>
  )
}

// Rendered only once signed in, so only in the browser. The route's header covers hosts that send
// it, and this covers any that don't.
const Approve = ({ request }: { request: string | undefined }) => {
  if (window.top !== window.self) return <Note>Open this page directly.</Note>
  if (!request) return <Note>Start connecting from your agent, and it will send you here.</Note>
  return <Decide requestId={request} />
}

export const Connect = ({ request }: { request: string | undefined }) => (
  <>
    <AuthLoading>
      <main className="min-h-svh" />
    </AuthLoading>
    {/* Signing in here leaves the address alone, so the request is still there afterwards. */}
    <Unauthenticated>
      <SignIn key="connect" mode="signIn" />
    </Unauthenticated>
    <Authenticated>
      <main className="flex min-h-svh items-center justify-center p-6">
        <div className="grid w-full max-w-sm gap-4">
          <h1 className="font-heading text-lg font-medium">Connect an agent</h1>
          <Approve request={request} />
        </div>
      </main>
    </Authenticated>
  </>
)
