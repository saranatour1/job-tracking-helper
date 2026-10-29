import { api } from "@convex/_generated/api"
import type { allowKeys } from "@convex/api/features/email/models"
import { Connect } from "@convex/api/features/email/validators"
import { useForm } from "@tanstack/react-form"
import type { FunctionReturnType } from "convex/server"
import { useAction, useMutation, useQuery } from "convex/react"
import { startTransition, useActionState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { messageOf, Row, Section } from "@/features/account/settings"

type Connection = NonNullable<FunctionReturnType<typeof api.email.connection>>

const dateOf = (at: number) =>
  new Date(at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })

const tokenHelp = (
  <>
    Needs Email Sending, Workers Scripts and Email Routing Rules (Edit), and Zone (Read).{" "}
    <a
      href="https://dash.cloudflare.com/profile/api-tokens"
      target="_blank"
      rel="noreferrer"
      className="underline"
    >
      Create one
    </a>
    .
  </>
)

const fields = [
  {
    name: "accountId",
    label: "Account ID",
    hint: "On your Cloudflare dashboard's overview, under API.",
    type: "text",
  },
  { name: "apiToken", label: "API token", hint: tokenHelp, type: "password" },
  {
    name: "fromAddress",
    label: "Send from",
    hint: "An address on a domain with Email Sending turned on.",
    type: "email",
  },
] as const

// The connection as rows on the card, like the profile. The token field always starts
// empty: a saved token never comes back to the browser, so any change means pasting
// it again, and it's checked with Cloudflare before it replaces the old one.
const ConnectForm = ({ connection }: { connection: Connection | null }) => {
  const connect = useAction(api.email.connect)
  const [error, save] = useActionState(async (_: string | undefined, value: Connect) => {
    try {
      await connect(value)
      form.reset({ ...value, apiToken: "" })
    } catch (cause) {
      return messageOf(cause)
    }
  }, undefined)
  const form = useForm({
    defaultValues: {
      accountId: connection?.accountId ?? "",
      apiToken: "",
      fromAddress: connection?.fromAddress ?? "",
    },
    validators: { onSubmit: Connect },
    onSubmit: ({ value }) => startTransition(() => save(value)),
  })

  return (
    <form
      noValidate
      className="divide-y"
      onSubmit={(e) => {
        e.preventDefault()
        void form.handleSubmit()
      }}
    >
      {fields.map(({ name, label, hint, type }) => (
        <form.Field key={name} name={name}>
          {(field) => (
            <Row
              label={label}
              htmlFor={`email-${name}`}
              description={
                field.state.meta.errors.length ? (
                  <span className="text-destructive">{field.state.meta.errors[0]?.message}</span>
                ) : name === "apiToken" && connection ? (
                  <>
                    Added {dateOf(connection.tokenAddedAt)}. Paste a new one to replace it.{" "}
                    {tokenHelp}
                  </>
                ) : (
                  hint
                )
              }
            >
              <Input
                id={`email-${name}`}
                type={type}
                className="sm:w-64"
                placeholder={
                  name === "apiToken" && connection ? `•••• ${connection.tokenHint}` : ""
                }
                // Keep password managers and spellcheck away from the token.
                autoComplete="off"
                spellCheck={false}
                data-1p-ignore
                data-lpignore="true"
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
                aria-invalid={field.state.meta.errors.length > 0}
              />
            </Row>
          )}
        </form.Field>
      ))}
      <Row
        label={connection ? "Save changes" : "Connect Cloudflare"}
        description={
          error ? (
            <span role="alert" className="text-destructive">
              {error}
            </span>
          ) : (
            "The token is checked with Cloudflare, encrypted, and never shown again."
          )
        }
      >
        <form.Subscribe selector={(s) => s.isSubmitting}>
          {(busy) => (
            <Button type="submit" size="sm" disabled={busy}>
              {busy ? "Checking…" : connection ? "Save" : "Connect"}
            </Button>
          )}
        </form.Subscribe>
      </Row>
    </form>
  )
}

const Access = ({ ok, label }: { ok: boolean | undefined; label: string }) => (
  <Badge variant={ok ? "success" : ok === false ? "warning" : "secondary"}>
    {label}
    {ok ? "" : ok === false ? " missing" : " unknown"}
  </Badge>
)

const testOf = (connection: Connection) => {
  const test = connection.lastTest
  if (!connection.allow.send) return "Turn on “Send email” below first."
  if (!test) return "Sends a short email to your account's address."
  if (test.status === "queued") return `Sending to ${test.to}…`
  if (test.status === "failed")
    return <span className="text-destructive">Failed: {test.error}</span>
  return `Sent to ${test.to} on ${dateOf(test.at)}.`
}

const Connected = ({ connection }: { connection: Connection }) => {
  const sendTest = useAction(api.email.sendTest)
  const disconnect = useMutation(api.email.disconnect)
  const [error, test] = useActionState(() => sendTest().then(() => undefined, messageOf), undefined)
  return (
    <>
      <Row label="Token can" description="Setting up incoming mail needs Workers and Routing.">
        <div className="flex flex-wrap justify-end gap-1">
          <Access ok={connection.access.sending} label="Sending" />
          <Access ok={connection.access.workers} label="Workers" />
          <Access ok={connection.access.routing} label="Routing" />
        </div>
      </Row>
      <Row
        label="Test email"
        description={error ? <span className="text-destructive">{error}</span> : testOf(connection)}
      >
        <Button
          size="sm"
          variant="outline"
          disabled={!connection.allow.send}
          onClick={() => startTransition(test)}
        >
          Send test
        </Button>
      </Row>
      <Row label="Disconnect" description="Deletes the saved token and details. Sent emails stay.">
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            if (window.confirm("Disconnect Cloudflare and delete the saved token?"))
              void disconnect()
          }}
        >
          Disconnect
        </Button>
      </Row>
    </>
  )
}

const switches: {
  key: (typeof allowKeys)[number]
  label: string
  description: string
  needs?: "setup"
}[] = [
  {
    key: "send",
    label: "Send email",
    description: "Test emails now, and replies you write later. Always from your address.",
  },
  {
    key: "setup",
    label: "Set up Cloudflare for you",
    description:
      "Deploy the Worker and add the routing rule that bring mail in. Nothing else in your account is touched.",
    needs: "setup",
  },
  {
    key: "receive",
    label: "Keep incoming mail",
    description: "Store mail sent to your address, encrypted, and match it to your applications.",
  },
  {
    key: "read",
    label: "Let Jev read your mail",
    description:
      "So it can tell an interview invite from a rejection. Off, mail is matched by sender only.",
  },
]

// Each switch is checked on the server before the app acts, so off means it can't.
const OnYourBehalf = ({ connection }: { connection: Connection }) => {
  const setAllow = useMutation(api.email.setAllow)
  const canSetUp = connection.access.workers && connection.access.routing
  return (
    <Section title="On your behalf">
      {switches.map(({ key, label, description, needs }) => (
        <Row
          key={key}
          label={label}
          htmlFor={`allow-${key}`}
          description={
            needs && !canSetUp
              ? "Your token can't do this yet: it needs Workers Scripts and Email Routing Rules."
              : description
          }
        >
          <Switch
            id={`allow-${key}`}
            checked={connection.allow[key]}
            disabled={Boolean(needs) && !canSetUp}
            onCheckedChange={(value) => void setAllow({ key, value })}
          />
        </Row>
      ))}
    </Section>
  )
}

export const EmailSection = () => {
  const connection = useQuery(api.email.connection)
  if (connection === undefined) return null
  return (
    <>
      <Section title="Email">
        {/* Keyed so a saved change starts the form from the new account and address. */}
        <ConnectForm
          key={connection ? `${connection.accountId}:${connection.fromAddress}` : "new"}
          connection={connection}
        />
        {connection && <Connected connection={connection} />}
      </Section>
      {connection && <OnYourBehalf connection={connection} />}
    </>
  )
}
