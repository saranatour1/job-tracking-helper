import { api } from "@convex/_generated/api"
import { Link, useNavigate, useSearch } from "@tanstack/react-router"
import { usePaginatedQuery, useQuery } from "convex/react"
import { useId } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Switch } from "@/components/ui/switch"
import { PageIntro, pageBody, Tile } from "@/features/shell/page-body"
import { PageHeader } from "@/features/shell/page-header"
import { cn } from "@/lib/utils"

// Reads `?q=`, `?remote=` and `?compact=` for the route, dropping anything it doesn't
// know.
export const jobsSearch = (
  search: Record<string, unknown>
): { q?: string; remote?: boolean; compact?: boolean } => ({
  q: typeof search.q === "string" && search.q.trim() ? search.q.slice(0, 200) : undefined,
  remote: search.remote === true ? true : undefined,
  compact: search.compact === true ? true : undefined,
})

// One line per role: title, company, where, posted, then the verdict and More like this.
const compactRow =
  "hover:bg-accent/30 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 rounded-md px-2.5 py-1 text-[13px] md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_4rem_13rem]"

const day = (ms: number) =>
  new Date(ms).toLocaleDateString("en", { month: "short", day: "numeric" })

// Every role in the shared catalog. Search it, keep to remote roles, and from any role
// find more like it. Roles a loop has judged show Jev's verdict for you.
export const Jobs = () => {
  const { q, remote, compact } = useSearch({ from: "/_app/jobs" })
  const navigate = useNavigate({ from: "/jobs" })
  const remoteId = useId()
  const compactId = useId()
  const stats = useQuery(api.jobs.stats)
  const jobs = usePaginatedQuery(
    api.jobs.search,
    { q, remoteOnly: remote },
    { initialNumItems: 25 }
  )
  return (
    <div className="soft-theme bg-background text-foreground flex h-svh flex-col rounded-[inherit] md:h-[calc(100svh-1rem)]">
      <PageHeader crumbs={[{ label: "Jobs" }]} />
      <ScrollArea className="min-h-0 flex-1">
        <div className={pageBody}>
          <PageIntro
            title="Jobs"
            description={
              stats
                ? `${stats.jobs.toLocaleString("en")} open roles from ${stats.boards} company job boards, refreshed daily and shared by everyone. Your loops pick from these, and Jev judges which fit you.`
                : "Open roles from company job boards, refreshed daily."
            }
          />
          <form
            className="flex flex-wrap items-center gap-3"
            onSubmit={(e) => {
              e.preventDefault()
              const q = new FormData(e.currentTarget).get("q")
              const words = typeof q === "string" ? q.trim() : ""
              void navigate({ search: (prev) => ({ ...prev, q: words || undefined }) })
            }}
          >
            <Input
              key={q}
              name="q"
              type="search"
              size="sm"
              aria-label="Search roles"
              placeholder="Search roles, teams, companies or places"
              defaultValue={q}
              className="max-w-96 flex-1"
            />
            <Button type="submit" size="sm" variant="outline">
              Search
            </Button>
            <label htmlFor={remoteId} className="flex items-center gap-2 text-[13px]">
              <Switch
                id={remoteId}
                checked={Boolean(remote)}
                onCheckedChange={(on) =>
                  void navigate({ search: (prev) => ({ ...prev, remote: on || undefined }) })
                }
              />
              Remote only
            </label>
            <label htmlFor={compactId} className="flex items-center gap-2 text-[13px]">
              <Switch
                id={compactId}
                checked={Boolean(compact)}
                onCheckedChange={(on) =>
                  void navigate({ search: (prev) => ({ ...prev, compact: on || undefined }) })
                }
              />
              Compact
            </label>
            {q && (
              <Button
                size="sm"
                variant="ghost"
                render={<Link to="/jobs" search={{ remote, compact }} />}
              >
                Clear search
              </Button>
            )}
          </form>
          <Tile title={q ? `Best matches for “${q}”` : "Newest first"} className="gap-0 p-1.5">
            {jobs.status !== "LoadingFirstPage" && jobs.results.length === 0 && (
              <p className="text-muted-foreground px-2.5 py-2 text-[13px]">
                No roles match. Try fewer or different words.
              </p>
            )}
            {compact && jobs.results.length > 0 && (
              <div
                className={cn(
                  compactRow,
                  "text-muted-foreground py-1 text-xs hover:bg-transparent"
                )}
              >
                <span>Role</span>
                <span className="hidden md:block">Company</span>
                <span className="hidden md:block">Where</span>
                <span className="hidden md:block">Posted</span>
                <span />
              </div>
            )}
            {jobs.results.map((job) => {
              const where = `${job.location || "Not listed"}${job.remote && !/remote/i.test(job.location) ? " · Remote" : ""}`
              const verdict = job.verdict && (
                <Badge
                  variant={job.verdict === "fit" ? "success" : "outline"}
                  className="font-normal"
                >
                  {job.verdict === "fit" ? `Fits you · ${job.fit}%` : "Not a fit"}
                </Badge>
              )
              const more = (
                <Button
                  size="xs"
                  variant="ghost"
                  render={<Link to="/jobs" search={{ q: job.title, remote, compact }} />}
                >
                  More like this
                </Button>
              )
              const title = (
                <a
                  href={job.url}
                  target="_blank"
                  rel="noreferrer"
                  className="truncate font-medium hover:underline"
                >
                  {job.title}
                </a>
              )
              return compact ? (
                <div key={job._id} className={compactRow}>
                  <span className="flex min-w-0 flex-col">
                    {title}
                    <span className="text-muted-foreground truncate text-xs md:hidden">
                      {job.company} · {where}
                    </span>
                  </span>
                  <span className="hidden truncate md:block">{job.company}</span>
                  <span className="text-muted-foreground hidden truncate md:block">{where}</span>
                  <span className="text-muted-foreground hidden md:block">{day(job.postedAt)}</span>
                  <span className="flex items-center justify-end gap-1">
                    {verdict}
                    {more}
                  </span>
                </div>
              ) : (
                <div
                  key={job._id}
                  className="hover:bg-accent/30 grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 rounded-md px-2.5 py-2 text-[13px]"
                >
                  <div className="flex min-w-0 flex-col gap-0.5">
                    {title}
                    <span className="text-muted-foreground truncate text-xs">
                      {job.company} · {where} · {day(job.postedAt)}
                    </span>
                    <p className="text-muted-foreground line-clamp-2 text-xs">{job.preview}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    {verdict}
                    {more}
                  </div>
                </div>
              )
            })}
            {jobs.status === "CanLoadMore" && (
              <Button
                size="xs"
                variant="ghost"
                className="m-1 self-start"
                onClick={() => jobs.loadMore(25)}
              >
                Show more
              </Button>
            )}
          </Tile>
        </div>
      </ScrollArea>
    </div>
  )
}
