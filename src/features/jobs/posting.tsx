import { canPrepare } from "@convex/features/jobs/links"
import { track } from "@databuddy/sdk"
import { LinkSquare02Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { Link } from "@tanstack/react-router"
import { useQuery } from "convex-helpers/react/cache/hooks"
import { startTransition } from "react"

import { bodyOf, Markdown } from "@/components/markdown"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { ago, Badges, Evidence, external, type Row, useVisitorSearch } from "@/features/jobs/jobs"
import { PrepareButton } from "@/features/prefilled/prefilled"
import { PageIntro, pageBody, Tile } from "@/features/shell/page-body"
import { PageHeader } from "@/features/shell/page-header"
import { useAccess } from "@/hooks/use-access"
import { api } from "@/lib/api"

// One role's own page, which is what gets shared. Signed-in or not, it shows the same role.
export const Posting = ({ job }: { job: Row & { text: string } }) => {
  const { member: signedIn } = useAccess()
  const [refused, visitorSearch, searching] = useVisitorSearch()
  const seen = { job: job._id, company: job.company }
  const now = Date.now()
  const row = useQuery(api.prefilled.list, signedIn ? {} : "skip")?.find((r) => r.url === job.url)
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {signedIn && <PageHeader crumbs={[{ label: "Jobs", to: "/jobs" }, { label: job.title }]} />}
      <ScrollArea className="min-h-0 flex-1">
        <div className={pageBody}>
          <PageIntro
            title={job.title}
            description={`${job.company} · ${job.location || "Location not listed"} · posted ${ago(job.postedAt, now)} ago`}
          />
          <span className="flex flex-wrap gap-1 empty:hidden">
            <Badges job={job} openings={1} now={now} />
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
            {signedIn && canPrepare(job.url) && (
              <PrepareButton jobId={job._id} status={row?.status} prefillId={row?._id} />
            )}
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
