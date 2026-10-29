import { api } from "@convex/_generated/api"
import type { Id } from "@convex/_generated/dataModel"
import type { FunctionReturnType } from "convex/server"
import { useMutation } from "convex/react"
import { useQuery } from "convex-helpers/react/cache/hooks"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Popover, PopoverPopup, PopoverTitle, PopoverTrigger } from "@/components/ui/popover"

type MailEvent = FunctionReturnType<typeof api.email.timeline>[number]

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

const dayOf = (at: number) =>
  new Date(at).toLocaleDateString(undefined, { month: "short", day: "numeric" })

// One line per email: what it said, its subject, who sent it and when.
const Timeline = ({ events }: { events: MailEvent[] }) => (
  <ol className="grid gap-2">
    {events.map((e) => (
      <li key={e.id} className="grid gap-0.5 text-sm">
        <div className="flex items-center gap-2">
          <Badge variant={kindVariant(e.kind)}>{kindNames[e.kind]}</Badge>
          <span className="truncate font-medium">{e.subject}</span>
        </div>
        <span className="text-muted-foreground text-xs">
          {e.from} · {dayOf(e.at)}
          {e.portalUrl && (
            <>
              {" · "}
              <a href={e.portalUrl} target="_blank" rel="noreferrer" className="underline">
                Open portal
              </a>
            </>
          )}
        </span>
      </li>
    ))}
  </ol>
)

/** The newest email for an application, with the rest in a popover. */
export const MailCell = ({ applicationId }: { applicationId: Id<"applications"> }) => {
  const events = useQuery(api.email.timeline)?.filter((e) => e.applicationId === applicationId)
  const resolve = useMutation(api.email.resolveSuggestion)
  if (!events?.length) return <span className="text-muted-foreground">–</span>
  const [latest] = events as [MailEvent, ...MailEvent[]]
  const suggestion = events.find((e) => e.suggest)
  const portal = events.find((e) => e.portalUrl)?.portalUrl
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Popover>
        <PopoverTrigger render={<Button size="xs" variant="ghost" />}>
          <Badge variant={kindVariant(latest.kind)}>{kindNames[latest.kind]}</Badge>
          <span className="text-muted-foreground">
            {dayOf(latest.at)}
            {events.length > 1 && ` · ${events.length} emails`}
          </span>
        </PopoverTrigger>
        <PopoverPopup align="start" className="w-80">
          <PopoverTitle className="mb-2 text-sm">Mail</PopoverTitle>
          <Timeline events={events} />
        </PopoverPopup>
      </Popover>
      {portal && (
        <Button
          size="xs"
          variant="outline"
          render={<a href={portal} target="_blank" rel="noreferrer" />}
        >
          Check status
        </Button>
      )}
      {suggestion?.suggest && (
        <span className="flex items-center gap-1 text-xs">
          Mark as {suggestion.suggest}?
          <Button
            size="xs"
            variant="outline"
            onClick={() => void resolve({ eventId: suggestion.id, accept: true })}
          >
            Yes
          </Button>
          <Button
            size="xs"
            variant="ghost"
            onClick={() => void resolve({ eventId: suggestion.id, accept: false })}
          >
            No
          </Button>
        </span>
      )}
    </div>
  )
}

/** Emails that didn't match an application, each with a picker to file it. */
export const UnsortedMail = ({
  applications,
}: {
  applications: { _id: Id<"applications">; company: string; role: string }[]
}) => {
  const unsorted = useQuery(api.email.timeline)?.filter((e) => e.applicationId === null)
  const assign = useMutation(api.email.assign)
  if (!unsorted?.length) return null
  return (
    <Popover>
      <PopoverTrigger render={<Button size="sm" variant="outline" className="self-start" />}>
        {unsorted.length} unsorted {unsorted.length === 1 ? "email" : "emails"}
      </PopoverTrigger>
      <PopoverPopup align="start" className="w-96">
        <PopoverTitle className="mb-2 text-sm">Unsorted mail</PopoverTitle>
        <ol className="grid gap-3">
          {unsorted.map((e) => (
            <li key={e.id} className="grid gap-1">
              <Timeline events={[e]} />
              <select
                aria-label={`Application for ${e.subject}`}
                className="border-input h-8 rounded-md border bg-transparent px-2 text-xs"
                value=""
                onChange={(event) =>
                  void assign({
                    eventId: e.id,
                    applicationId: event.target.value as Id<"applications">,
                  })
                }
              >
                <option value="" disabled>
                  File under…
                </option>
                {applications.map((a) => (
                  <option key={a._id} value={a._id}>
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
