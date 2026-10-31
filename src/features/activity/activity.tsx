import { api } from "@convex/_generated/api"
import { Link } from "@tanstack/react-router"
import type { FunctionReturnType } from "convex/server"
import { useMutation } from "convex/react"
import { useQuery } from "convex-helpers/react/cache/hooks"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { messageOf } from "@/features/account/settings"
import { statusLabels, statusVariant } from "@/features/prefilled/prefilled"
import { PageIntro, pageBody, Tile, tileGrid } from "@/features/shell/page-body"
import { PageHeader } from "@/features/shell/page-header"

type Run = FunctionReturnType<typeof api.prefilled.list>[number]

const when = (ms: number) =>
  new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(ms)

// One finished application: what it used, what it was missing, and what to do about it.
const RunTile = ({ run }: { run: Run }) => {
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
          <Button
            size="xs"
            variant="ghost"
            render={<Link to="/" search={{ app: run.applicationId }} />}
          >
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

// What's finished, newest first: sent, stopped or set aside. What's waiting is under
// Prefilled applications.
export const Activity = () => {
  const rows = useQuery(api.prefilled.list)
  const done = (rows ?? []).filter(
    (r) => r.status === "applied" || r.status === "failed" || r.status === "dismissed"
  )
  const month = Date.now() - 30 * 24 * 60 * 60 * 1000
  const applied = done.filter((r) => r.status === "applied" && (r.sentAt ?? 0) > month)
  const used = new Set(applied.flatMap((r) => r.fields.flatMap((f) => f.entryKey ?? []))).size
  return (
    <div className="soft-theme bg-background text-foreground flex h-svh flex-col rounded-[inherit] md:h-[calc(100svh-1rem)]">
      <PageHeader crumbs={[{ label: "Activity" }]} />
      <ScrollArea className="min-h-0 flex-1">
        <main className={pageBody}>
          <PageIntro
            title="Activity"
            description="Applications you've sent, and ones that stopped or you set aside: which saved answers each used, and what was missing."
          />
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
        </main>
      </ScrollArea>
    </div>
  )
}
