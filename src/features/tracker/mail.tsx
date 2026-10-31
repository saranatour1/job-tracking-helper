import { api } from "@/lib/api"
import type { Id } from "@convex/_generated/dataModel"
import { companyAddress } from "@convex/features/email/addresses"
import { maxUnsortedCount } from "@convex/features/email/validators"
import { Mail01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { Link } from "@tanstack/react-router"
import { useAction } from "convex/react"
import type { FunctionReturnType } from "convex/server"
import { usePaginatedQuery, useQuery } from "convex-helpers/react/cache/hooks"
import { startTransition, useActionState, useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverPopup, PopoverTitle, PopoverTrigger } from "@/components/ui/popover"
import { Textarea } from "@/components/ui/textarea"
import { messageOf } from "@/features/account/settings"

import { type Application, type ApplicationCard, formatDate, statusLabels } from "./data"
import { useSource } from "./source"

// Company mail filed under applications, from the email feature. Only real applications
// have any; the sample source has none.
export type MailEvent = FunctionReturnType<typeof api.email.timeline>[number]

const kindNames: Record<MailEvent["kind"], string> = {
  confirmation: "Received",
  interview: "Interview",
  rejection: "Rejected",
  offer: "Offer",
  portal: "Portal update",
  other: "Email",
}

const kindVariant = (kind: MailEvent["kind"]) =>
  kind === "offer" || kind === "interview"
    ? "success"
    : kind === "rejection"
      ? "error"
      : "secondary"

const iso = (at: number) => new Date(at).toISOString()

// The form lives inside the dialog, so it starts fresh each time the dialog opens.
const ComposeForm = ({
  applicationId,
  to,
  subject,
  replyTo,
}: {
  applicationId: Id<"applications">
  to?: string
  subject?: string
  replyTo?: MailEvent["id"]
}) => {
  const send = useAction(api.email.sendFromApplication)
  type State = { sent?: boolean; error?: string }
  const [state, submit, pending] = useActionState<State, FormData>(async (_, form) => {
    try {
      await send({
        applicationId,
        to: form.get("to") as string,
        subject: form.get("subject") as string,
        text: form.get("text") as string,
        ...(replyTo && { replyTo }),
      })
      return { sent: true }
    } catch (cause) {
      return { error: messageOf(cause) }
    }
  }, {})
  if (state.sent)
    return (
      <>
        <DialogHeader>
          <DialogTitle>Sent</DialogTitle>
          <DialogDescription>It's on this application's activity now.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Close</DialogClose>
        </DialogFooter>
      </>
    )
  return (
    <form action={submit} className="contents">
      <DialogHeader>
        <DialogTitle>{replyTo ? "Reply" : "New email"}</DialogTitle>
        <DialogDescription>Sent from your own address, through your Cloudflare.</DialogDescription>
      </DialogHeader>
      <DialogPanel className="grid gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor="mail-to">To</Label>
          <Input id="mail-to" name="to" type="email" defaultValue={to} required />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="mail-subject">Subject</Label>
          <Input id="mail-subject" name="subject" defaultValue={subject} maxLength={500} required />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="mail-text">Message</Label>
          <Textarea id="mail-text" name="text" rows={8} maxLength={20000} required />
        </div>
        {state.error && (
          <p role="alert" className="text-destructive text-xs">
            {state.error}
          </p>
        )}
      </DialogPanel>
      <DialogFooter>
        <DialogClose render={<Button variant="ghost" />}>Cancel</DialogClose>
        <Button type="submit" disabled={pending}>
          {pending ? "Sending…" : "Send"}
        </Button>
      </DialogFooter>
    </form>
  )
}

const Compose = ({
  trigger,
  ...form
}: {
  trigger: React.ReactElement
  applicationId: Id<"applications">
  to?: string
  subject?: string
  replyTo?: MailEvent["id"]
}) => (
  <Dialog>
    <DialogTrigger render={trigger} />
    <DialogPopup className="sm:max-w-lg">
      <ComposeForm {...form} />
    </DialogPopup>
  </Dialog>
)

/** Whether mail for this application can find its way back, and the address to give out. */
export const MailStatus = ({ a }: { a: Application }) => {
  const connection = useQuery(api.email.connection)
  const makePlain = useAction(api.email.makeAddressWithoutPlus)
  const [copied, copy] = useActionState(async (_: boolean, address: string) => {
    await navigator.clipboard.writeText(address)
    return true
  }, false)
  const [plain, askPlain, making] = useActionState<{ address?: string; error?: string }>(
    async () => {
      try {
        return { address: await makePlain({ applicationId: a.id as Id<"applications"> }) }
      } catch (cause) {
        return { error: messageOf(cause) }
      }
    },
    {}
  )
  const { real } = useSource()
  if (!real || connection === undefined) return null
  const tagged = connection?.tracking ? companyAddress(connection.fromAddress, a.company) : null
  const address = plain.address ?? tagged
  return (
    <div className="bg-muted/40 flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-[13px]">
      <HugeiconsIcon icon={Mail01Icon} className="text-muted-foreground size-3.5 shrink-0" />
      <span className="min-w-0 flex-1 break-words">
        {address ? (
          <>
            Tracking mail at <span className="font-medium">{address}</span>
          </>
        ) : !connection?.receivingSince ? (
          <>
            Mail isn't reaching the app yet.{" "}
            <Link to="/account" className="underline underline-offset-2">
              Set up incoming mail
            </Link>
          </>
        ) : (
          <>
            Mail is matched by company name.{" "}
            <Link to="/account" className="underline underline-offset-2">
              Give each company its own address
            </Link>
          </>
        )}
      </span>
      {address && (
        <Button size="xs" variant="ghost" onClick={() => startTransition(() => copy(address))}>
          {copied ? "Copied" : "Copy"}
        </Button>
      )}
      {tagged && !plain.address && (
        <Button
          size="xs"
          variant="ghost"
          disabled={making}
          onClick={() => startTransition(() => askPlain())}
        >
          Form refuses a +
        </Button>
      )}
      {connection?.allow.send && (
        <Compose
          applicationId={a.id as Id<"applications">}
          trigger={
            <Button size="xs" variant="outline">
              Email
            </Button>
          }
        />
      )}
      {plain.error && (
        <p role="alert" className="text-destructive w-full text-xs">
          {plain.error}
        </p>
      )}
    </div>
  )
}

export const mailPage = 25

/** An application's mail, newest first, a page at a time. */
export const useMailFor = (id: string) =>
  usePaginatedQuery(
    api.email.forApplication,
    useSource().real ? { applicationId: id as Id<"applications"> } : "skip",
    { initialNumItems: mailPage }
  )

// The email itself, fetched only once someone opens it.
const MailBody = ({ id, e }: { id: MailEvent["id"]; e: MailEvent }) => {
  const connection = useQuery(api.email.connection)
  const body = useQuery(api.email.mailBody, { eventId: id })
  if (body === undefined) return <span className="text-muted-foreground text-xs">Opening…</span>
  if (body === null)
    return <span className="text-muted-foreground text-xs">This email can't be read anymore.</span>
  return (
    <span className="bg-muted/40 mt-1 flex max-h-80 flex-col gap-2 overflow-y-auto rounded-md border p-3 text-xs">
      {body.to && <span className="text-muted-foreground">To {body.to}</span>}
      <span className="leading-relaxed whitespace-pre-wrap">{body.text || "(no text)"}</span>
      {body.attachments.length > 0 && (
        <span className="text-muted-foreground">Attached: {body.attachments.join(", ")}</span>
      )}
      {!e.sent && e.applicationId && connection?.allow.send && (
        <Compose
          applicationId={e.applicationId}
          to={body.from}
          subject={/^re:/i.test(body.subject) ? body.subject : `Re: ${body.subject}`}
          replyTo={id}
          trigger={
            <Button size="xs" variant="outline" className="self-start">
              Reply
            </Button>
          }
        />
      )}
    </span>
  )
}

/** One email as a line in an application's activity, with its body a click away. */
export const MailLine = ({ e }: { e: MailEvent }) => {
  const [open, setOpen] = useState(false)
  return (
    <>
      <HugeiconsIcon icon={Mail01Icon} className="text-muted-foreground mt-0.5 size-3.5 shrink-0" />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex min-w-0 items-center gap-1.5">
          <Badge variant={e.sent ? "info" : kindVariant(e.kind)} size="sm">
            {e.sent ? "Sent" : kindNames[e.kind]}
          </Badge>
          <span className="truncate font-medium">{e.subject}</span>
        </span>
        <span className="text-muted-foreground text-xs">
          {e.sent ? `To ${e.to}` : `From ${e.from}`}
          {e.portalUrl && (
            <>
              {" · "}
              <a href={e.portalUrl} target="_blank" rel="noreferrer" className="underline">
                Check status
              </a>
            </>
          )}
          {" · "}
          <button
            type="button"
            aria-expanded={open}
            className="hover:text-foreground underline"
            onClick={() => setOpen(!open)}
          >
            {open ? "Hide" : "Read"}
          </button>
        </span>
        {open && <MailBody id={e.id} e={e} />}
      </span>
      <span className="text-muted-foreground ms-auto shrink-0 text-xs">
        {formatDate(iso(e.at))}
      </span>
    </>
  )
}

/** The newest status an email suggests, until it's accepted or dismissed, or the move
 * Jev made from one, with an undo. */
export const Suggestion = ({ mail }: { mail: MailEvent[] }) => {
  const { answerMail, undoMove } = useSource()
  const moved = mail.find((m) => m.moved)
  if (moved?.moved)
    return (
      <div className="bg-muted/40 flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-[13px]">
        <HugeiconsIcon icon={Mail01Icon} className="text-muted-foreground size-3.5" />
        <span className="min-w-0 flex-1">
          Jev moved this to <span className="font-medium">{statusLabels[moved.moved.to]}</span>{" "}
          after “{moved.subject}”.
        </span>
        <Button size="xs" variant="outline" onClick={() => undoMove(moved.id)}>
          Undo
        </Button>
      </div>
    )
  const e = mail.find((m) => m.suggest)
  if (!e?.suggest) return null
  return (
    <div className="bg-muted/40 flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-[13px]">
      <HugeiconsIcon icon={Mail01Icon} className="text-muted-foreground size-3.5" />
      <span className="min-w-0 flex-1">
        The email “{e.subject}” suggests moving this to{" "}
        <span className="font-medium">{statusLabels[e.suggest]}</span>.
      </span>
      <Button size="xs" variant="outline" onClick={() => answerMail(e.id, true)}>
        Yes
      </Button>
      <Button size="xs" variant="ghost" onClick={() => answerMail(e.id, false)}>
        No
      </Button>
    </div>
  )
}

/** The newest email on a card or row, with how many there are. */
export const MailBadge = ({ a: { mail } }: { a: ApplicationCard }) => {
  if (!mail) return null
  return (
    <Badge variant={kindVariant(mail.kind)} size="sm" className="gap-1">
      <HugeiconsIcon icon={Mail01Icon} className="size-3" />
      {kindNames[mail.kind]}
      {mail.count > 1 && <span className="opacity-70">· {mail.count}</span>}
    </Badge>
  )
}

// Opened only with the button, since each email has to be decrypted to show.
const UnsortedList = () => {
  const { applications, fileMail } = useSource()
  const {
    results: unsorted,
    status,
    loadMore,
  } = usePaginatedQuery(api.email.unsorted, {}, { initialNumItems: mailPage })
  return (
    <ol className="grid max-h-96 gap-3 overflow-y-auto">
      {unsorted.map((e) => (
        <li key={e.id} className="grid gap-1.5 text-[13px]">
          <div className="flex items-start gap-2.5">
            <MailLine e={e} />
          </div>
          <select
            aria-label={`Application for ${e.subject}`}
            className="border-input h-8 rounded-md border bg-transparent px-2 text-xs"
            value=""
            onChange={(event) => fileMail(e.id, event.target.value)}
          >
            <option value="" disabled>
              File under…
            </option>
            {applications.map((a) => (
              <option key={a.id} value={a.id}>
                {a.company}: {a.role}
              </option>
            ))}
          </select>
        </li>
      ))}
      {status === "CanLoadMore" && (
        <li>
          <Button variant="ghost" size="xs" onClick={() => loadMore(mailPage)}>
            Load more
          </Button>
        </li>
      )}
    </ol>
  )
}

/** Mail that matched no application, each with a picker to file it. */
export const UnsortedMail = () => {
  const { real } = useSource()
  const count = useQuery(api.email.unsortedCount, real ? {} : "skip")
  if (!count) return null
  return (
    <Popover>
      <PopoverTrigger render={<Button size="xs" variant="outline" />}>
        <HugeiconsIcon icon={Mail01Icon} />
        {count >= maxUnsortedCount ? `${maxUnsortedCount}+` : count} unsorted
      </PopoverTrigger>
      <PopoverPopup align="end" className="w-96">
        <PopoverTitle className="mb-2 text-sm">Unsorted mail</PopoverTitle>
        <UnsortedList />
      </PopoverPopup>
    </Popover>
  )
}
