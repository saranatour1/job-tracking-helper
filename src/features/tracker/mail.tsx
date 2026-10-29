import type { api } from "@convex/_generated/api"
import { Mail01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import type { FunctionReturnType } from "convex/server"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Popover, PopoverPopup, PopoverTitle, PopoverTrigger } from "@/components/ui/popover"

import { formatDate, statusLabels } from "./data"
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

/** An application's mail, newest first. */
export const useMailFor = (id: string) => useSource().mail.filter((e) => e.applicationId === id)

/** One email as a line in an application's activity. */
export const MailLine = ({ e }: { e: MailEvent }) => (
  <>
    <HugeiconsIcon icon={Mail01Icon} className="text-muted-foreground mt-0.5 size-3.5 shrink-0" />
    <span className="flex min-w-0 flex-col gap-0.5">
      <span className="flex min-w-0 items-center gap-1.5">
        <Badge variant={kindVariant(e.kind)} size="sm">
          {kindNames[e.kind]}
        </Badge>
        <span className="truncate font-medium">{e.subject}</span>
      </span>
      <span className="text-muted-foreground text-xs">
        From {e.from}
        {e.portalUrl && (
          <>
            {" · "}
            <a href={e.portalUrl} target="_blank" rel="noreferrer" className="underline">
              Check status
            </a>
          </>
        )}
      </span>
    </span>
    <span className="text-muted-foreground ms-auto shrink-0 text-xs">{formatDate(iso(e.at))}</span>
  </>
)

/** The newest status an email suggests, until it's accepted or dismissed. */
export const Suggestion = ({ mail }: { mail: MailEvent[] }) => {
  const { answerMail } = useSource()
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
export const MailBadge = ({ id }: { id: string }) => {
  const mail = useMailFor(id)
  const latest = mail[0]
  if (!latest) return null
  return (
    <Badge variant={kindVariant(latest.kind)} size="sm" className="gap-1">
      <HugeiconsIcon icon={Mail01Icon} className="size-3" />
      {kindNames[latest.kind]}
      {mail.length > 1 && <span className="opacity-70">· {mail.length}</span>}
    </Badge>
  )
}

/** Mail that matched no application, each with a picker to file it. */
export const UnsortedMail = () => {
  const { applications, mail, fileMail } = useSource()
  const unsorted = mail.filter((e) => e.applicationId === null)
  if (!unsorted.length) return null
  return (
    <Popover>
      <PopoverTrigger render={<Button size="xs" variant="outline" />}>
        <HugeiconsIcon icon={Mail01Icon} />
        {unsorted.length} unsorted
      </PopoverTrigger>
      <PopoverPopup align="end" className="w-96">
        <PopoverTitle className="mb-2 text-sm">Unsorted mail</PopoverTitle>
        <ol className="grid gap-3">
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
        </ol>
      </PopoverPopup>
    </Popover>
  )
}
