import { api } from "@convex/_generated/api"
import type { Doc } from "@convex/_generated/dataModel"
import { Link } from "@tanstack/react-router"
import { useMutation } from "convex/react"
import { useQuery } from "convex-helpers/react/cache/hooks"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { messageOf } from "@/features/account/settings"
import { PageIntro, pageBody, Tile, tileGrid } from "@/features/shell/page-body"
import { PageHeader } from "@/features/shell/page-header"

type Run = Doc<"autoApplies">

const statusLabels: Record<Run["status"], string> = {
  queued: "Queued",
  running: "Applying…",
  needsYou: "Needs you",
  previewed: "Previewed",
  applied: "Applied",
  failed: "Failed",
}
const statusVariant: Record<Run["status"], "secondary" | "info" | "warning" | "success" | "error"> =
  {
    queued: "secondary",
    running: "info",
    needsYou: "warning",
    previewed: "info",
    applied: "success",
    failed: "error",
  }

const when = (ms: number) =>
  new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(ms)

// One run: what it used, what it was missing, and what to do about it.
const RunTile = ({ run }: { run: Run }) => {
  const retry = useMutation(api.autoApply.retry)
  const cancel = useMutation(api.autoApply.cancel)
  const act = (fn: () => Promise<unknown>) => fn().catch((cause) => window.alert(messageOf(cause)))
  const title = (
    <span className="me-auto flex min-w-0 flex-col">
      <span className="truncate text-[13px] font-medium">
        {run.title} · {run.company}
      </span>
      <span className="text-muted-foreground text-xs">
        {when(run.finishedAt ?? run.startedAt ?? run.queuedAt)}
        {run.dryRun && " · dry run"}
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
      {run.used.length > 0 && (
        <p className="text-muted-foreground px-1 text-xs">
          Used: <span className="text-foreground">{run.used.map((u) => u.label).join(", ")}</span>
        </p>
      )}
      {run.missing.length > 0 && (
        <div className="flex flex-col gap-1 px-1 text-xs">
          <span className="text-muted-foreground">No saved answer for:</span>
          <ul className="flex flex-col gap-1">
            {run.missing.map((m, i) => (
              <li key={`${i}-${m.question}`} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-[13px]">
                  {m.question}
                  {m.required && <span className="text-muted-foreground"> · required</span>}
                </span>
                <Button
                  size="xs"
                  variant="outline"
                  render={<Link to="/preferences" search={{ tab: "prefilled", add: m.question }} />}
                >
                  Add to Prefilled
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
        {(run.status === "needsYou" || run.status === "failed" || run.status === "previewed") &&
          !run.submittedAt && (
            <Button size="xs" variant="outline" onClick={() => act(() => retry({ id: run._id }))}>
              Try again
            </Button>
          )}
        {run.status === "queued" && (
          <Button size="xs" variant="ghost" onClick={() => act(() => cancel({ id: run._id }))}>
            Take out
          </Button>
        )}
      </div>
    </Tile>
  )
}

// What auto-apply did for you, newest first, and what it needs from you.
export const Activity = () => {
  const runs = useQuery(api.autoApply.list)
  const settings = useQuery(api.autoApply.settings)
  const month = Date.now() - 30 * 24 * 60 * 60 * 1000
  const applied = (runs ?? []).filter((r) => r.status === "applied" && (r.finishedAt ?? 0) > month)
  const used = new Set(applied.flatMap((r) => r.used.map((u) => u.key))).size
  const last = runs?.find((r) => r.finishedAt)
  return (
    <div className="soft-theme bg-background text-foreground flex h-svh flex-col rounded-[inherit] md:h-[calc(100svh-1rem)]">
      <PageHeader crumbs={[{ label: "Activity" }]} />
      <ScrollArea className="min-h-0 flex-1">
        <main className={pageBody}>
          <PageIntro
            title="Activity"
            description="What auto-apply did for you: which saved answers each application used, and what it still needs from you."
          >
            {settings && !settings.on && (
              <Button size="sm" variant="outline" render={<Link to="/account" />}>
                Turn on auto-apply
              </Button>
            )}
          </PageIntro>
          {runs && runs.length > 0 && (
            <p className="text-muted-foreground text-[13px]">
              Last run {last ? when(last.finishedAt!) : "still going"} · {applied.length} applied in
              30 days · {used} saved {used === 1 ? "answer" : "answers"} used
            </p>
          )}
          {runs && runs.length === 0 && (
            <p className="text-muted-foreground text-[13px]">
              Nothing yet. On the Jobs page, press Auto-apply on a role.
            </p>
          )}
          <div className={tileGrid}>
            {(runs ?? []).map((run) => (
              <RunTile key={run._id} run={run} />
            ))}
          </div>
        </main>
      </ScrollArea>
    </div>
  )
}
