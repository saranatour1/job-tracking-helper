import { useApplicationText, usePrefillRoutes, useWorkflowRoutes } from "@/lib/route-ids"
import { api } from "@/lib/api"
import { getRouteApi, Link } from "@tanstack/react-router"
import type { FunctionReturnType } from "convex/server"
import { useMutation } from "convex/react"
import { usePaginatedQuery, useQuery } from "convex-helpers/react/cache/hooks"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { messageOf } from "@/features/account/settings"
import { statusLabels, statusVariant } from "@/features/prefilled/prefilled"
import { PageIntro, pageBody, Tile, tileGrid } from "@/features/shell/page-body"
import { PageHeader } from "@/features/shell/page-header"

import type { Show } from "./search"

type Run = FunctionReturnType<typeof api.prefilled.list>[number]
type Event = FunctionReturnType<typeof api.activity.page>["page"][number]

const route = getRouteApi("/_app/activity")

const pageSize = 30

const workNames: Record<string, string> = {
  "mail.received": "Email in",
  "mail.send": "Email out",
  "prefill.live": "Browser",
  "prefill.prepare": "Prepared",
  "prefill.sent": "Sent",
}

// Everything else by what it's about: loop.run and loop.update are both a Loop.
const areaNames: Record<string, string> = {
  account: "Account",
  application: "Application",
  booking: "Booking",
  calendar: "Calendar",
  contact: "Contact",
  goal: "Goal",
  loop: "Loop",
  mail: "Email",
  preferences: "Preferences",
  prefill: "Prefilled",
  view: "View",
  workflow: "Workflow",
}

const nameOf = (work: string) => workNames[work] ?? areaNames[work.split(".")[0] ?? ""] ?? work

const when = (ms: number) =>
  new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(ms)

// One finished application: what it used, what it was missing, and what to do about it.
const RunTile = ({ run }: { run: Run }) => {
  const application = useApplicationText(run.applicationId)
  const again = useMutation(api.prefilled.prepareAgain)
  const used = run.fields.filter((f) => f.source === "saved" || f.source === "jev")
  const missing = run.fields.filter((f) => !f.answer)
  const title = (
    <span className="me-auto flex min-w-0 flex-col">
      <span className="truncate text-[13px] font-medium">
        {run.title} · {run.company}
      </span>
      <span className="text-muted-foreground text-xs">
        {when(run.sentAt ?? run.preparedAt ?? run._creationTime)}
      </span>
    </span>
  )
  return (
    <Tile
      title={title}
      actions={
        <Badge variant={statusVariant[run.status]} className="shrink-0 font-normal">
          {statusLabels[run.status]}
        </Badge>
      }
      className="gap-3"
    >
      {run.error && <p className="px-1 text-[13px]">{run.error}</p>}
      {run.confirmation && (
        <p className="text-muted-foreground px-1 text-[13px]">{run.confirmation}</p>
      )}
      {used.length > 0 && (
        <p className="text-muted-foreground px-1 text-xs">
          Used: <span className="text-foreground">{used.map((f) => f.question).join(", ")}</span>
        </p>
      )}
      {run.status !== "applied" && missing.length > 0 && (
        <div className="flex flex-col gap-1 px-1 text-xs">
          <span className="text-muted-foreground">No saved answer for:</span>
          <ul className="flex flex-col gap-1">
            {missing.map((m) => (
              <li key={m.question} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-[13px]">
                  {m.question}
                  {m.required && <span className="text-muted-foreground"> · required</span>}
                </span>
                <Button
                  size="xs"
                  variant="outline"
                  render={<Link to="/preferences" search={{ tab: "prefilled", add: m.question }} />}
                >
                  Add to saved answers
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="mt-auto flex flex-wrap items-center gap-1 px-1">
        <Button
          size="xs"
          variant="ghost"
          render={<a href={run.url} target="_blank" rel="noopener noreferrer" />}
        >
          Open the posting
        </Button>
        {run.applicationId && (
          <Button size="xs" variant="ghost" render={<Link to="/pipeline" search={{ app: application }} />}>
            Open the application
          </Button>
        )}
        {run.status !== "applied" && (
          <Button
            size="xs"
            variant="outline"
            onClick={() => again({ id: run._id }).catch((cause) => window.alert(messageOf(cause)))}
          >
            Try again
          </Button>
        )}
      </div>
    </Tile>
  )
}

// Where to go to see or fix it.
const EventLink = ({ event }: { event: Event }) => {
  const application = useApplicationText(event.applicationId)
  const prefills = usePrefillRoutes()
  const workflows = useWorkflowRoutes()
  const open = (link: React.ReactElement) => (
    <Button size="xs" variant="ghost" render={link}>
      Open
    </Button>
  )
  if (event.prefillId)
    return open(<Link to="/prefilled/$id" params={{ id: prefills.text(event.prefillId) }} />)
  if (event.automationId)
    return open(<Link to="/workflows/$id" params={{ id: workflows.text(event.automationId) }} />)
  if (event.applicationId) return open(<Link to="/pipeline" search={{ app: application }} />)
  if (event.work === "loop.run") return open(<Link to="/loops" />)
  if (
    event.work.startsWith("account.") ||
    event.work === "mail.setup" ||
    event.work === "mail.connect"
  )
    return open(<Link to="/account" />)
  if (event.work.startsWith("preferences.")) return open(<Link to="/preferences" />)
  return null
}

const EventRow = ({ event }: { event: Event }) => (
  <li className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b py-2.5 text-[13px]">
    <span className="text-muted-foreground w-20 shrink-0 text-xs">{nameOf(event.work)}</span>
    <span className="flex min-w-40 flex-1 flex-col gap-0.5">
      <span className="break-words">{event.summary ?? event.outcome}</span>
      {event.error && (
        <span
          className={`text-xs break-words ${event.failed ? "text-destructive" : "text-muted-foreground"}`}
        >
          {event.error}
        </span>
      )}
    </span>
    {event.failed && (
      <Badge variant="error" className="shrink-0 font-normal">
        Failed
      </Badge>
    )}
    <EventLink event={event} />
    <time className="text-muted-foreground shrink-0 text-xs">{when(event.at)}</time>
  </li>
)

const Events = ({ failed }: { failed: boolean }) => {
  const joinedAt = useQuery(api.activity.joinedAt)
  const { results, status, loadMore } = usePaginatedQuery(
    api.activity.page,
    failed ? { failed } : {},
    { initialNumItems: pageSize }
  )
  return (
    <>
      {failed && status !== "LoadingFirstPage" && results.length === 0 && (
        <p className="text-muted-foreground text-[13px]">Nothing has failed.</p>
      )}
      <ul>
        {results.map((event) => (
          <EventRow key={event._id} event={event} />
        ))}
        {!failed && status === "Exhausted" && joinedAt && (
          <li className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-[13px]">
            <span className="text-muted-foreground w-20 shrink-0 text-xs">Account</span>
            <span className="min-w-40 flex-1">You joined</span>
            <time className="text-muted-foreground shrink-0 text-xs">{when(joinedAt)}</time>
          </li>
        )}
      </ul>
      {status === "CanLoadMore" && (
        <div className="text-center">
          <Button size="xs" variant="ghost" onClick={() => loadMore(pageSize)}>
            Load more
          </Button>
        </div>
      )}
    </>
  )
}

// What's finished, newest first: sent, stopped or set aside. What's waiting is under
// Prefilled applications.
const Applications = () => {
  const rows = useQuery(api.prefilled.list)
  const done = (rows ?? []).filter(
    (r) => r.status === "applied" || r.status === "failed" || r.status === "dismissed"
  )
  const month = Date.now() - 30 * 24 * 60 * 60 * 1000
  const applied = done.filter((r) => r.status === "applied" && (r.sentAt ?? 0) > month)
  const used = new Set(applied.flatMap((r) => r.fields.flatMap((f) => f.entryKey ?? []))).size
  return (
    <>
      {done.length > 0 && (
        <p className="text-muted-foreground text-[13px]">
          {applied.length} applied in 30 days · {used} saved {used === 1 ? "answer" : "answers"}{" "}
          used
        </p>
      )}
      {rows && done.length === 0 && (
        <p className="text-muted-foreground text-[13px]">
          Nothing yet. What's waiting for you is under Prefilled applications.
        </p>
      )}
      <div className={tileGrid}>
        {done.map((run) => (
          <RunTile key={run._id} run={run} />
        ))}
      </div>
    </>
  )
}

const tabs: { label: string; show?: Show }[] = [
  { label: "Everything" },
  { label: "Failed", show: "failed" },
  { label: "Applications", show: "applications" },
]

export const Activity = () => {
  const { show } = route.useSearch()
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader crumbs={[{ label: "Activity" }]} />
      <ScrollArea className="min-h-0 flex-1">
        <main className={pageBody}>
          <PageIntro
            title="Activity"
            description="Everything on your account since you joined: what you changed, what the app did for you, and why anything failed."
          />
          <div className="flex flex-wrap gap-1">
            {tabs.map((tab) => (
              <Button
                key={tab.label}
                size="sm"
                variant={tab.show === show ? "secondary" : "ghost"}
                render={<Link to="/activity" search={tab.show ? { show: tab.show } : {}} />}
              >
                {tab.label}
              </Button>
            ))}
          </div>
          {show === "applications" ? <Applications /> : <Events failed={show === "failed"} />}
        </main>
      </ScrollArea>
    </div>
  )
}
