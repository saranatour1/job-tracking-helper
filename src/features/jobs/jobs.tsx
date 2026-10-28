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

// Reads `?q=` and `?remote=` for the route, dropping anything it doesn't know.
export const jobsSearch = (search: Record<string, unknown>): { q?: string; remote?: boolean } => ({
  q: typeof search.q === "string" && search.q.trim() ? search.q.slice(0, 200) : undefined,
  remote: search.remote === true ? true : undefined,
})

const day = (ms: number) =>
  new Date(ms).toLocaleDateString("en", { month: "short", day: "numeric" })

// Every role in the shared catalog. Search it, keep to remote roles, and from any role
// find more like it. Roles a loop has judged show Jev's verdict for you.
export const Jobs = () => {
  const { q, remote } = useSearch({ from: "/_app/jobs" })
  const navigate = useNavigate({ from: "/jobs" })
  const remoteId = useId()
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
            {q && (
              <Button size="sm" variant="ghost" render={<Link to="/jobs" search={{ remote }} />}>
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
            {jobs.results.map((job) => (
              <div
                key={job._id}
                className="hover:bg-accent/30 grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 rounded-md px-2.5 py-2 text-[13px]"
              >
                <div className="flex min-w-0 flex-col gap-0.5">
                  <a
                    href={job.url}
                    target="_blank"
                    rel="noreferrer"
                    className="truncate font-medium hover:underline"
                  >
                    {job.title}
                  </a>
                  <span className="text-muted-foreground truncate text-xs">
                    {job.company} · {job.location || "Location not listed"}
                    {job.remote && !/remote/i.test(job.location) && " · Remote"} ·{" "}
                    {day(job.postedAt)}
                  </span>
                  <p className="text-muted-foreground line-clamp-2 text-xs">{job.preview}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  {job.verdict && (
                    <Badge
                      variant={job.verdict === "fit" ? "success" : "outline"}
                      className="font-normal"
                    >
                      {job.verdict === "fit" ? `Fits you · ${job.fit}%` : "Not a fit"}
                    </Badge>
                  )}
                  <Button
                    size="xs"
                    variant="ghost"
                    render={<Link to="/jobs" search={{ q: job.title, remote }} />}
                  >
                    More like this
                  </Button>
                </div>
              </div>
            ))}
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
