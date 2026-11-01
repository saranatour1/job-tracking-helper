import { readOnlyScopes } from "@convex/features/agents/scopes"
import { useAction, useMutation } from "convex/react"
import { useQuery } from "convex-helpers/react/cache/hooks"
import { startTransition, useActionState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { messageOf, Row, Section } from "@/features/account/settings"
import { mcp } from "@/lib/api"
import { mcpUrl } from "@/lib/seo"

const Copyable = ({ children }: { children: string }) => (
  <code className="bg-muted rounded px-2 py-1 text-xs break-all select-all">{children}</code>
)

const CreateKey = () => {
  const createApiKey = useAction(mcp.createApiKey)
  const [result, create, creating] = useActionState(
    async (_: { apiKey?: string; error?: string } | undefined, data: FormData) => {
      try {
        const { apiKey } = await createApiKey({
          name: data.get("name") as string,
          ...(data.get("readOnly") && { scopes: readOnlyScopes }),
        })
        return { apiKey }
      } catch (cause) {
        return { error: messageOf(cause) }
      }
    },
    undefined
  )
  return (
    <>
      <form
        className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3"
        onSubmit={(e) => {
          e.preventDefault()
          const data = new FormData(e.currentTarget)
          startTransition(() => create(data))
        }}
      >
        <div className="grid min-w-48 flex-1 gap-0.5">
          <span className="text-sm font-medium">New API key</span>
          <p className="text-muted-foreground text-xs">
            For agents you set up by hand, like Claude Code. Agents that ask you to sign in don't
            need one.
          </p>
        </div>
        <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto">
          <Input
            name="name"
            aria-label="Key name"
            placeholder="Name"
            className="sm:w-36"
            required
          />
          <label className="flex items-center gap-1.5 text-xs">
            <Switch name="readOnly" aria-label="Read only" /> Read only
          </label>
          <Button type="submit" size="sm" variant="outline" disabled={creating}>
            Create
          </Button>
        </div>
      </form>
      {result?.error && (
        <p role="alert" className="text-destructive px-4 py-3 text-xs">
          {result.error}
        </p>
      )}
      {result?.apiKey && (
        <div className="grid gap-2 px-4 py-3">
          <p className="text-xs">Copy this key now. It won't be shown again.</p>
          <Copyable>{result.apiKey}</Copyable>
          <p className="text-muted-foreground text-xs">To add it to Claude Code:</p>
          <Copyable>{`claude mcp add --transport http job-tracking-helper ${mcpUrl} --header "Authorization: Bearer ${result.apiKey}"`}</Copyable>
        </div>
      )}
    </>
  )
}

export const AgentsSection = () => {
  const connections = useQuery(mcp.listConnections)
  const revoke = useMutation(mcp.revokeConnection)
  return (
    <Section title="Connected agents">
      <Row
        label="Server address"
        description="Paste this into Claude, ChatGPT, Cursor or any agent that takes an MCP server. It can then find jobs, prepare applications and draft answers with your data. It can't submit an application."
      >
        <Copyable>{mcpUrl}</Copyable>
      </Row>
      {connections?.map((c) => (
        <Row
          key={c.id}
          label={c.name}
          description={`${c.kind === "apiKey" ? "API key" : "Signed-in agent"}, ${
            c.scopes.every((s) => s.endsWith(":read")) ? "read only" : "can make changes"
          }. ${c.lastUsedAt ? `Last used ${new Date(c.lastUsedAt).toLocaleDateString()}.` : "Not used yet."}`}
        >
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              if (window.confirm(`Disconnect ${c.name}? It stops working right away.`))
                void revoke({ id: c.id })
            }}
          >
            Disconnect
          </Button>
        </Row>
      ))}
      <CreateKey />
    </Section>
  )
}
