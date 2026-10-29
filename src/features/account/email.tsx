import { api } from "@convex/_generated/api"
import type { allowKeys } from "@convex/api/features/email/models"
import { Connect } from "@convex/api/features/email/validators"
import { SquareLock02Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
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
  {
    name: "fromAddress",
    label: "Send from",
    hint: "An address on a domain with Email Sending turned on.",
    type: "email",
  },
] as const

// Drawn here: nothing about a saved token, not even its length, comes from the server.
const mask = "••••••••••••••••"

// Keep password managers and spellcheck away from what's typed here.
const quiet = {
  autoComplete: "off",
  spellCheck: false,
  "data-1p-ignore": true,
  "data-lpignore": "true",
} as const

// The connection as rows on the card, like the profile. A saved token is locked: it
// can't be viewed or copied, only replaced. Changing the account or address reuses
// it on the server, and a new token is checked with Cloudflare before it replaces it.
const ConnectForm = ({ connection }: { connection: Connection | null }) => {
  const connect = useAction(api.email.connect)
  const [error, save] = useActionState(async (_: string | undefined, value: Connect) => {
    try {
      await connect(value)
      form.reset({ ...value, apiToken: "", replacing: false })
    } catch (cause) {
      return messageOf(cause)
    }
  }, undefined)
  const form = useForm({
    defaultValues: {
      accountId: connection?.accountId ?? "",
      apiToken: "",
      fromAddress: connection?.fromAddress ?? "",
      // Whether the token field is open for a new token. Always open before connecting.
      replacing: !connection,
    },
    validators: { onSubmit: Connect },
    onSubmit: ({ value: { replacing, ...input } }) =>
      startTransition(() => save(replacing ? input : { ...input, apiToken: "" })),
  })

  const textRow = ({ name, label, hint, type }: (typeof fields)[number]) => (
    <form.Field key={name} name={name}>
      {(field) => (
        <Row
          label={label}
          htmlFor={`email-${name}`}
          description={
            field.state.meta.errors.length ? (
              <span className="text-destructive">{field.state.meta.errors[0]?.message}</span>
            ) : (
              hint
            )
          }
        >
          <Input
            id={`email-${name}`}
            type={type}
            className="sm:w-64"
            {...quiet}
            value={field.state.value}
            onBlur={field.handleBlur}
            onChange={(e) => field.handleChange(e.target.value)}
            aria-invalid={field.state.meta.errors.length > 0}
          />
        </Row>
      )}
    </form.Field>
  )

  return (
    <form
      noValidate
      className="divide-y"
      onSubmit={(e) => {
        e.preventDefault()
        void form.handleSubmit()
      }}
    >
      {textRow(fields[0])}
      <form.Subscribe selector={(s) => s.values.replacing}>
        {(replacing) =>
          replacing ? (
            <form.Field
              name="apiToken"
              validators={{
                onSubmit: ({ value }) =>
                  value.trim() ? undefined : { message: "Paste a Cloudflare API token." },
              }}
            >
              {(field) => (
                <Row
                  label="API token"
                  htmlFor="email-apiToken"
                  description={
                    field.state.meta.errors.length ? (
                      <span className="text-destructive">
                        {field.state.meta.errors[0]?.message}
                      </span>
                    ) : (
                      tokenHelp
                    )
                  }
                >
                  <Input
                    id="email-apiToken"
                    type="password"
                    className="sm:w-64"
                    {...quiet}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                    aria-invalid={field.state.meta.errors.length > 0}
                  />
                  {connection && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        form.setFieldValue("apiToken", "")
                        form.setFieldValue("replacing", false)
                      }}
                    >
                      Cancel
                    </Button>
                  )}
                </Row>
              )}
            </form.Field>
          ) : (
            <Row
              label="API token"
              description={`Locked. Added ${connection ? dateOf(connection.tokenAddedAt) : ""}. It can't be viewed or copied, only replaced.`}
            >
              <div className="relative sm:w-44">
                <Input
                  readOnly
                  tabIndex={-1}
                  aria-label="Saved API token, locked"
                  className="pe-8 select-none"
                  value={mask}
                />
                <HugeiconsIcon
                  icon={SquareLock02Icon}
                  className="text-muted-foreground pointer-events-none absolute end-2.5 top-1/2 size-4 -translate-y-1/2"
                />
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => form.setFieldValue("replacing", true)}
              >
                Replace
              </Button>
            </Row>
          )
        }
      </form.Subscribe>
      {textRow(fields[1])}
      <Row
        label={connection ? "Save changes" : "Connect Cloudflare"}
        description={
          error ? (
            <span role="alert" className="text-destructive">
              {error}
            </span>
          ) : connection ? (
            "Checked with Cloudflare using your saved token, unless you replace it."
          ) : (
            "The token is checked with Cloudflare, encrypted, and locked."
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
  const disconnect = useAction(api.email.disconnect)
  const setUp = useAction(api.email.setUpInbound)
  const stop = useAction(api.email.stopInbound)
  const [error, test] = useActionState(() => sendTest().then(() => undefined, messageOf), undefined)
  const [inboundError, inbound] = useActionState(
    (_: string | undefined, start: boolean) =>
      (start ? setUp() : stop()).then(() => undefined, messageOf),
    undefined
  )
  const canSetUp = connection.allow.setup && connection.allow.receive
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
      <Row
        label="Incoming mail"
        description={
          inboundError ? (
            <span className="text-destructive">{inboundError}</span>
          ) : connection.receivingSince ? (
            `Receiving at ${connection.fromAddress} since ${dateOf(connection.receivingSince)}.`
          ) : canSetUp ? (
            `Adds a Worker and a routing rule for ${connection.fromAddress}. Email Routing must already be on for the domain.`
          ) : (
            "Turn on “Set up Cloudflare for you” and “Keep incoming mail” below first."
          )
        }
      >
        {connection.receivingSince ? (
          <Button size="sm" variant="outline" onClick={() => startTransition(() => inbound(false))}>
            Stop
          </Button>
        ) : (
          <Button
            size="sm"
            variant="outline"
            disabled={!canSetUp}
            onClick={() => startTransition(() => inbound(true))}
          >
            Set up
          </Button>
        )}
      </Row>
      <Row
        label="Disconnect"
        description="Removes the Worker and routing rule, then deletes the saved token and details. Emails stay."
      >
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
    description:
      "Store mail sent to your address, encrypted. Off, mail to your address is turned away.",
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

// Mail that came in, newest first. Grouping it under applications comes next.
const RecentMail = () => {
  const mail = useQuery(api.email.recentMail)
  if (!mail?.length) return null
  return (
    <Section title="Recent mail">
      {mail.map((m) => (
        <Row key={m.id} label={m.subject} description={`${m.from} · ${m.snippet}`}>
          <span className="text-muted-foreground text-xs whitespace-nowrap">{dateOf(m.at)}</span>
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
      {connection && <RecentMail />}
    </>
  )
}
