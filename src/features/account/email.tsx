import { api } from "@/lib/api"
import type { Id } from "@convex/_generated/dataModel"
import { type allowKeys, Connect } from "@convex/features/email/validators"
import { SquareLock02Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useForm } from "@tanstack/react-form"
import type { FunctionReturnType } from "convex/server"
import { useAction, useMutation } from "convex/react"
import { useQuery } from "convex-helpers/react/cache/hooks"
import { startTransition, useActionState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { messagesIn } from "@convex/features/email/addresses"
import { hasSignature, signatureHtml } from "@convex/features/email/signature"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { messageOf, Row, Section } from "@/features/account/settings"

type Connection = NonNullable<FunctionReturnType<typeof api.email.connection>>

const maxImportBytes = 500 * 1024 * 1024
// A message with big attachments is skipped. What it says would still fit, but the raw file wouldn't.
const maxMessageChars = 10_000_000

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
    return (
      <span className="text-destructive">
        Failed: {test.error || "we couldn't confirm it went out."}
      </span>
    )
  return `Sent to ${test.to} on ${dateOf(test.at)}.`
}

// A small square copy, since this goes inside every email.
const signatureCopy = async (source: Blob) => {
  const image = await createImageBitmap(source)
  const side = Math.min(image.width, image.height)
  const canvas = document.createElement("canvas")
  canvas.width = canvas.height = 160
  canvas
    .getContext("2d")
    ?.drawImage(
      image,
      (image.width - side) / 2,
      (image.height - side) / 2,
      side,
      side,
      0,
      0,
      160,
      160
    )
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("That photo couldn't be read."))),
      "image/jpeg",
      0.85
    )
  )
}

const SignaturePhoto = ({ connection }: { connection: Connection }) => {
  const me = useQuery(api.users.me)
  const uploadUrl = useMutation(api.users.generateUploadUrl)
  const setPhoto = useMutation(api.email.setSignaturePhoto)
  const [error, run, pending] = useActionState(
    async (_: string | undefined, step: Blob | string | null) => {
      try {
        if (step === null) return void (await setPhoto({}))
        const source = typeof step === "string" ? await (await fetch(step)).blob() : step
        const res = await fetch(await uploadUrl(), {
          method: "POST",
          headers: { "Content-Type": "image/jpeg" },
          body: await signatureCopy(source),
        })
        const { storageId } = (await res.json()) as { storageId: Id<"_storage"> }
        return void (await setPhoto({ photo: storageId }))
      } catch (cause) {
        return messageOf(cause)
      }
    },
    undefined
  )
  const go = (step: Blob | string | null) => startTransition(() => run(step))
  return (
    <Row
      label="Signature photo"
      description={
        error ? (
          <span className="text-destructive">{error}</span>
        ) : connection.signaturePhotoUrl ? (
          "Goes under your name on mail you write. Replies you send from Gmail use Gmail's signature."
        ) : (
          "Adds your photo and name under mail you write here."
        )
      }
    >
      <div className="flex flex-wrap items-center justify-end gap-2">
        {connection.signaturePhotoUrl && (
          <img src={connection.signaturePhotoUrl} alt="" className="size-8 rounded-full" />
        )}
        {me?.imageUrl && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => go(me.imageUrl!)}
          >
            Use my profile photo
          </Button>
        )}
        <Button size="sm" variant="outline" disabled={pending} render={<label />}>
          Choose photo
          <input
            type="file"
            accept="image/jpeg,image/png"
            className="sr-only"
            disabled={pending}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) go(file)
            }}
          />
        </Button>
        {connection.signaturePhotoUrl && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() => go(null)}
          >
            Remove
          </Button>
        )}
      </div>
    </Row>
  )
}

// What goes out, drawn by the same code. Mail gets no scripts, so this frame allows none either.
const SignaturePreview = ({ connection }: { connection: Connection }) => (
  <div className="flex flex-col gap-2 px-4 py-3">
    <div>
      <p className="text-[13px] font-medium">Signature preview</p>
      <p className="text-muted-foreground text-xs">
        {hasSignature(connection.signature, Boolean(connection.signaturePhotoUrl))
          ? "What goes under mail you write here. Change the details under Profile."
          : "Add a photo here, or a link under Profile, and this goes under mail you write."}
      </p>
    </div>
    <iframe
      title="Email signature preview"
      sandbox=""
      className="h-28 w-full rounded-lg border bg-white"
      srcDoc={`<!doctype html><body style="margin:0;padding:0 12px;background:#fff">${signatureHtml(connection.signature, connection.signaturePhotoUrl)}</body>`}
    />
  </div>
)

// Reads files here and sends one email at a time, so a big export can't hit a size limit.
const ImportMail = ({ allowed }: { allowed: boolean }) => {
  const importMail = useAction(api.email.importMail)
  type Result = { filed: number; total: number; error?: string }
  const [result, run, pending] = useActionState<Result | null, FileList>(async (_, files) => {
    const done: Result = { filed: 0, total: 0 }
    try {
      for (const file of files) {
        if (file.size > maxImportBytes) throw new Error(`${file.name} is over 500 MB.`)
        const messages = file.name.endsWith(".mbox")
          ? messagesIn(await file.text())
          : [await file.text()]
        for (const raw of messages) {
          done.total++
          if (raw.length <= maxMessageChars && (await importMail({ raw })) === "filed") done.filed++
        }
      }
      return done
    } catch (cause) {
      return { ...done, error: messageOf(cause) }
    }
  }, null)
  return (
    <Row
      label="Import old mail"
      description={
        result?.error ? (
          <span className="text-destructive">{result.error}</span>
        ) : result ? (
          `Filed ${result.filed} of ${result.total}. The rest matched no application, or were already here, and weren't kept.`
        ) : (
          "Add .eml or .mbox files from your mail app. Only mail matching an application is kept, by company name, with no AI."
        )
      }
    >
      <Button size="sm" variant="outline" disabled={!allowed || pending} render={<label />}>
        {pending ? "Importing…" : "Choose files"}
        <input
          type="file"
          multiple
          accept=".eml,.mbox"
          className="sr-only"
          disabled={!allowed || pending}
          onChange={(e) => {
            const files = e.target.files
            if (files?.length) startTransition(() => run(files))
          }}
        />
      </Button>
    </Row>
  )
}

const Connected = ({ connection }: { connection: Connection }) => {
  const sendTest = useAction(api.email.sendTest)
  const disconnect = useAction(api.email.disconnect)
  const setUp = useAction(api.email.setUpInbound)
  const stop = useAction(api.email.stopInbound)
  const [error, test] = useActionState(() => sendTest().then(() => undefined, messageOf), undefined)
  const [inboundError, inbound] = useActionState(
    (_: string | undefined, start: FormData | false) => {
      const forwardTo = start && (start.get("forwardTo") as string).trim()
      return (start ? setUp(forwardTo ? { forwardTo } : {}) : stop()).then(
        () => undefined,
        messageOf
      )
    },
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
          {connection.access.zone === false && <Access ok={false} label="Domain" />}
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
            `Receiving at ${connection.fromAddress} since ${dateOf(connection.receivingSince)}.${connection.forwardTo ? ` A copy goes to ${connection.forwardTo}.` : ""}`
          ) : canSetUp ? (
            `Adds a Worker and a routing rule for ${connection.fromAddress}. Email Routing must already be on for the domain. That mail then comes here instead of any inbox it reaches today, so give an address to keep a copy going there. Cloudflare has to have verified it first.`
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
          <form action={inbound} className="flex items-center gap-2">
            <Input
              name="forwardTo"
              type="email"
              aria-label="Also forward to"
              placeholder="Also forward to (optional)"
              disabled={!canSetUp}
              className="w-56"
            />
            <Button type="submit" size="sm" variant="outline" disabled={!canSetUp}>
              Set up
            </Button>
          </form>
        )}
      </Row>
      <SignaturePhoto connection={connection} />
      <SignaturePreview connection={connection} />
      <ImportMail allowed={connection.allow.receive} />
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
  // What has to be on first: the token's setup permissions, Jev reading mail, or incoming mail.
  needs?: "setup" | "read" | "receiving"
}[] = [
  {
    key: "send",
    label: "Send email",
    description: "Test emails, and mail you write from an application. Always from your address.",
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
    key: "tag",
    label: "Give each company its own address",
    description:
      "Like you+hooli@yourdomain, so mail lands on the right application. Turn on Subaddressing under Email Routing, then Settings, in Cloudflare first: without it, mail to these addresses bounces.",
    needs: "receiving",
  },
  {
    key: "read",
    label: "Let Jev read your mail",
    description:
      "So it can tell an interview invite from a rejection. Off, mail is matched by sender only.",
  },
  {
    key: "move",
    label: "Let Jev move cards",
    description:
      "When an email clearly says interview, offer or rejection, Jev moves the application and tells you, with an undo. Off, it only suggests.",
    needs: "read",
  },
]

// Each switch is checked on the server before the app acts, so off means it can't.
const OnYourBehalf = ({ connection }: { connection: Connection }) => {
  const setAllow = useMutation(api.email.setAllow)
  const canSetUp = connection.access.workers && connection.access.routing
  return (
    <Section title="On your behalf">
      {switches.map(({ key, label, description, needs }) => {
        const blocked =
          needs === "setup"
            ? !canSetUp &&
              (connection.access.zone === false
                ? `Your token can't see ${connection.fromAddress.split("@")[1]}. In Cloudflare, give it Zone Read and Email Routing Rules Edit for that domain, then save again above.`
                : "Your token can't do this yet: it needs Workers Scripts and Email Routing Rules.")
            : needs === "read"
              ? !connection.allow.read && "Turn on “Let Jev read your mail” first."
              : needs === "receiving" && !connection.receivingSince && "Set up incoming mail first."
        return (
          <Row
            key={key}
            label={label}
            htmlFor={`allow-${key}`}
            description={blocked || description}
          >
            <Switch
              id={`allow-${key}`}
              checked={connection.allow[key] ?? false}
              disabled={Boolean(blocked)}
              onCheckedChange={(value) => void setAllow({ key, value })}
            />
          </Row>
        )
      })}
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
