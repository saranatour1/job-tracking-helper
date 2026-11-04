import { canPrepare } from "@convex/features/jobs/links"
import { track } from "@databuddy/sdk"
import { LinkSquare02Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { Link, useRouterState } from "@tanstack/react-router"
import { useQuery } from "convex-helpers/react/cache/hooks"
import { startTransition } from "react"

import { bodyOf, Markdown } from "@/components/markdown"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  ago,
  Badges,
  Evidence,
  external,
  type Row,
  MatchYou,
  SignInFor,
  TrackButton,
  useVisitorSearch,
} from "@/features/jobs/jobs"
import { PrepareButton } from "@/features/prefilled/prefilled"
import { PageIntro, pageBody, Tile } from "@/features/shell/page-body"
import { Breadcrumbs, type Crumb, PageHeader } from "@/features/shell/page-header"
import { useAccess } from "@/hooks/use-access"
import { api } from "@/lib/api"
import type { Facts } from "@convex/features/jobs/validators"

const factLabels: Record<keyof Facts, string> = {
  level: "Level",
  team: "Team",
  reportsTo: "Reports to",
  workMode: "Work mode",
  travel: "Travel",
  employment: "Type",
  pay: "Pay",
}

// One role's own page, which is what gets shared. Signed-in or not, it shows the same role.
export const Posting = ({ job }: { job: Row & { text: string; facts: Facts | null } }) => {
  const { member: signedIn } = useAccess()
  const [refused, visitorSearch, searching] = useVisitorSearch()
  const seen = { job: job._id, company: job.company }
  const now = Date.now()
  const row = useQuery(api.prefilled.list, signedIn ? {} : "skip")?.find((r) => r.url === job.url)
  const match = useQuery(api.jobs.match, signedIn ? { jobId: job._id } : "skip")
  // Back to the list this role was opened from, filters and page and all, when it was.
  const from = useRouterState({ select: (s) => s.location.state.jobs })
  const { boardId, pooled } = job.evidence
  const crumbs: Crumb[] = [
    { label: "Jobs", to: "/jobs", search: from ?? {}, back: Boolean(from) },
    ...(boardId && !pooled
      ? [{ label: job.company, to: "/jobs" as const, search: { board: boardId } }]
      : []),
    { label: job.title },
  ]
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {signedIn && <PageHeader crumbs={crumbs} />}
      <ScrollArea className="min-h-0 flex-1">
        <div className={pageBody}>
          {!signedIn && <Breadcrumbs crumbs={crumbs} className="-mb-2" />}
          <PageIntro
            title={job.title}
            description={`${job.company} · posted ${ago(job.postedAt, now)} ago`}
          />
          {job.places.length > 0 && (
            <span className="flex flex-wrap gap-1">
              {job.places.map((place) => (
                <Badge key={place} variant="secondary" className="font-normal">
                  {place}
                </Badge>
              ))}
            </span>
          )}
          {job.summary && <p className="max-w-prose text-[15px] leading-relaxed">{job.summary}</p>}
          {signedIn && <MatchYou jobId={job._id} match={match} />}
          {job.facts && (
            <dl className="grid max-w-2xl grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
              {(Object.keys(factLabels) as (keyof Facts)[]).map(
                (key) =>
                  job.facts?.[key] && (
                    <div key={key} className="flex flex-col gap-0.5">
                      <dt className="text-muted-foreground text-xs">{factLabels[key]}</dt>
                      <dd className="text-[13px]">{job.facts[key]}</dd>
                    </div>
                  )
              )}
            </dl>
          )}
          <span className="flex flex-wrap gap-1 empty:hidden">
            <Badges job={job} openings={1} now={now} nested />
            <Evidence job={job} now={now} />
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              onClick={() => track("job_apply_link", seen)}
              render={<a href={job.url} {...external} />}
            >
              <HugeiconsIcon icon={LinkSquare02Icon} />
              Open posting
            </Button>
            {signedIn ? (
              <TrackButton job={{ ...job, applicationId: match?.applicationId ?? null }} />
            ) : (
              <SignInFor label="Add to tracker" why="Sign in to keep this role on your board" />
            )}
            {canPrepare(job.url) &&
              (signedIn ? (
                <PrepareButton jobId={job._id} status={row?.status} prefillId={row?._id} />
              ) : (
                <SignInFor
                  label="Prepare"
                  why="Sign in to have its application filled in for you"
                />
              ))}
            {signedIn ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => track("job_more_like_this", seen)}
                render={<Link to="/jobs" search={{ q: job.title }} />}
              >
                More like this
              </Button>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                disabled={searching}
                onClick={() => {
                  track("job_more_like_this", seen)
                  startTransition(() => visitorSearch(job.title))
                }}
              >
                More like this
              </Button>
            )}
          </div>
          {refused && (
            <p role="alert" className="text-destructive text-[13px]">
              {refused}
            </p>
          )}
          <Tile title="The posting">
            <Markdown>{bodyOf(job.text)}</Markdown>
          </Tile>
        </div>
      </ScrollArea>
    </div>
  )
}
