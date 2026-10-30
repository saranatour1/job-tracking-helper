import { api } from "@convex/_generated/api"
import type { Id } from "@convex/_generated/dataModel"
import { rowLimits } from "@convex/api/features/preferences/rows"
import { Cancel01Icon, LinkSquare02Icon, Search01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { Link, useNavigate, useSearch } from "@tanstack/react-router"
import { useMutation } from "convex/react"
import { usePaginatedQuery, useQuery } from "convex-helpers/react/cache/hooks"
import { startTransition, useActionState, useMemo } from "react"

import { messageOf } from "@/features/account/settings"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Combobox,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxPopup,
} from "@/components/ui/combobox"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Toggle } from "@/components/ui/toggle"
import { PageIntro, pageBody, Tile } from "@/features/shell/page-body"
import { PageHeader } from "@/features/shell/page-header"
import { cn } from "@/lib/utils"

const postedWithin = { day: 1, week: 7, month: 30 } as const
type Posted = keyof typeof postedWithin
const postedLabels: Record<Posted | "any", string> = {
  any: "Any time",
  day: "Past day",
  week: "Past week",
  month: "Past month",
}

type JobsSearch = {
  q?: string
  remote?: boolean
  compact?: boolean
  posted?: Posted
  // A board id; the server finds nothing for one that isn't.
  board?: string
  fits?: boolean
}

// Reads the page's filters from the address, dropping anything it doesn't know.
export const jobsSearch = (search: Record<string, unknown>): JobsSearch => ({
  q: typeof search.q === "string" && search.q.trim() ? search.q.slice(0, 200) : undefined,
  remote: search.remote === true ? true : undefined,
  compact: search.compact === true ? true : undefined,
  posted:
    typeof search.posted === "string" && search.posted in postedWithin
      ? (search.posted as Posted)
      : undefined,
  board: typeof search.board === "string" && search.board ? search.board : undefined,
  fits: search.fits === true ? true : undefined,
})

const hour = 60 * 60 * 1000
const dayMs = 24 * hour

// "3h", "2d", "5w": how long ago a role was posted.
const ago = (ms: number, now: number) => {
  const hours = Math.max(0, Math.floor((now - ms) / hour))
  if (hours < 24) return `${hours || 1}h`
  const days = Math.floor(hours / 24)
  return days < 14 ? `${days}d` : `${Math.floor(days / 7)}w`
}

const compactRow =
  "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 rounded-md px-2.5 py-1.5 text-[13px] md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_3rem_auto]"

type Row = {
  _id: string
  url: string
  title: string
  company: string
  location: string
  remote: boolean
  postedAt: number
  preview: string
  fit: number | null
  verdict: "fit" | "notFit" | null
}

// What's worth seeing first about a role: remote, new, and what Jev thought of it.
const Badges = ({ job, now }: { job: Row; now: number }) => (
  <>
    {job.verdict && (
      <Badge variant={job.verdict === "fit" ? "success" : "outline"} className="font-normal">
        {job.verdict === "fit" ? `Fits you · ${job.fit}%` : "Not a fit"}
      </Badge>
    )}
    {now - job.postedAt < 2 * dayMs && (
      <Badge variant="info" className="font-normal">
        New
      </Badge>
    )}
    {job.remote && (
      <Badge variant="outline" className="font-normal">
        Remote
      </Badge>
    )}
  </>
)

const Initial = ({ company }: { company: string }) => (
  <span
    aria-hidden
    className="bg-muted text-foreground/80 flex size-8 shrink-0 items-center justify-center rounded-md text-xs font-semibold uppercase"
  >
    {company.trim()[0] ?? "?"}
  </span>
)

// Every role in the shared catalog. Search it, narrow it down, and from any role find
// more like it. Roles a loop or a pasted link judged show Jev's verdict for you.
const pileLabels = {
  queued: "Queued",
  running: "Applying…",
  needsYou: "Needs you",
  previewed: "Previewed",
  applied: "Applied",
  failed: "Failed",
} as const

// Puts the role in the auto-apply pile, or shows where it already is. A refusal (the
// switch is off, no resume, the daily limit) shows under the button.
const AutoApplyButton = ({
  jobId,
  status,
}: {
  jobId: Id<"jobs">
  status?: keyof typeof pileLabels
}) => {
  const queue = useMutation(api.autoApply.queue)
  const [error, add] = useActionState(
    () => queue({ jobId }).then(() => undefined, messageOf),
    undefined
  )
  if (status && status !== "failed")
    return (
      <Badge
        variant={status === "applied" ? "success" : status === "needsYou" ? "warning" : "secondary"}
        className="font-normal"
      >
        {pileLabels[status]}
      </Badge>
    )
  return (
    <span className="flex flex-col items-end">
      <Button size="xs" variant="ghost" onClick={() => startTransition(add)}>
        Auto-apply
      </Button>
      {error && (
        <span role="alert" className="text-destructive max-w-56 text-end text-xs">
          {error}
        </span>
      )}
    </span>
  )
}

export const Jobs = () => {
  const search = useSearch({ from: "/_app/jobs" })
  const { q, remote, compact, posted, board, fits } = search
  const navigate = useNavigate({ from: "/jobs" })
  const set = (patch: Partial<JobsSearch>) =>
    void navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true })
  const now = Date.now()
  // Fixed when the filter is picked, so a re-render past the hour doesn't reset the list;
  // rounded to the hour so the same filters ask the same question for a while.
  const since = useMemo(
    () =>
      posted ? Math.floor(Date.now() / hour) * hour - postedWithin[posted] * dayMs : undefined,
    [posted]
  )
  const stats = useQuery(api.jobs.stats)
  const companies = useQuery(api.jobs.companies) ?? []
  // Roles already in the auto-apply pile, by posting, for their badge.
  const piled = new Map((useQuery(api.autoApply.list) ?? []).map((r) => [r.url, r.status]))
  // Keyed by board, since two boards can share a company name.
  const options = companies.map((c) => ({ value: c.boardId, label: c.company, jobs: c.jobs }))
  const company = options.find((o) => o.value === board) ?? null
  const tags = usePaginatedQuery(api.preferences.tags, {}, { initialNumItems: rowLimits.tags })
  const suggestions = [
    ...new Set(
      tags.results
        .filter((t) => t.kind === "interest" || t.kind === "location" || t.kind === "company")
        .map((t) => t.value)
    ),
  ].slice(0, 8)
  const jobs = usePaginatedQuery(
    api.jobs.search,
    { q, remoteOnly: remote, boardId: board, since, fits },
    { initialNumItems: 25 }
  )
  const filtered = Boolean(q || remote || posted || board || fits)
  const heading = fits
    ? "Roles that fit you, best first"
    : q
      ? `Best matches for “${q}”`
      : "Newest first"

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

          <div className="flex flex-col gap-3">
            <form
              className="flex items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                const said = new FormData(e.currentTarget).get("q")
                const words = typeof said === "string" ? said.trim() : ""
                set({ q: words || undefined })
              }}
            >
              <div className="relative max-w-xl flex-1">
                <HugeiconsIcon
                  icon={Search01Icon}
                  className="text-muted-foreground pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2"
                />
                <Input
                  key={q}
                  name="q"
                  type="search"
                  aria-label="Search roles"
                  placeholder="Search roles, skills, teams, companies or places"
                  defaultValue={q}
                  className="ps-8"
                />
              </div>
              <Button type="submit" variant="outline">
                Search
              </Button>
            </form>

            {!q && suggestions.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                <span className="text-muted-foreground">Try</span>
                {suggestions.map((s) => (
                  <Button key={s} size="xs" variant="outline" onClick={() => set({ q: s })}>
                    {s}
                  </Button>
                ))}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filters">
              <Toggle
                size="sm"
                variant="outline"
                pressed={Boolean(remote)}
                onPressedChange={(on) => set({ remote: on || undefined })}
              >
                Remote only
              </Toggle>
              <Toggle
                size="sm"
                variant="outline"
                pressed={Boolean(fits)}
                onPressedChange={(on) => set({ fits: on || undefined })}
              >
                Fits me
              </Toggle>
              <Select
                value={posted ?? "any"}
                items={Object.entries(postedLabels).map(([value, label]) => ({ value, label }))}
                onValueChange={(v) =>
                  set({ posted: v === "any" || !v ? undefined : (v as Posted) })
                }
              >
                <SelectTrigger size="sm" aria-label="Posted" className="w-auto min-w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectPopup>
                  {Object.entries(postedLabels).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectPopup>
              </Select>
              <Combobox
                items={options}
                value={company}
                isItemEqualToValue={(a, b) => a.value === b.value}
                onValueChange={(picked) => set({ board: picked?.value })}
              >
                <ComboboxInput
                  size="sm"
                  className="w-48"
                  aria-label="Company"
                  placeholder="Any company"
                />
                <ComboboxPopup>
                  <ComboboxEmpty>No company matches.</ComboboxEmpty>
                  <ComboboxList>
                    {(option: (typeof options)[number]) => (
                      <ComboboxItem key={option.value} value={option}>
                        {option.label}
                        <span className="text-muted-foreground ms-auto ps-3 text-xs tabular-nums">
                          {option.jobs}
                        </span>
                      </ComboboxItem>
                    )}
                  </ComboboxList>
                </ComboboxPopup>
              </Combobox>
              <Toggle
                size="sm"
                variant="outline"
                pressed={Boolean(compact)}
                onPressedChange={(on) => set({ compact: on || undefined })}
              >
                Compact
              </Toggle>
              {filtered && (
                <Button size="sm" variant="ghost" render={<Link to="/jobs" search={{ compact }} />}>
                  <HugeiconsIcon icon={Cancel01Icon} />
                  Clear filters
                </Button>
              )}
            </div>
          </div>

          <Tile title={heading} className="gap-0 p-1.5">
            {jobs.status === "LoadingFirstPage" &&
              Array.from({ length: 5 }, (_, i) => (
                <div key={i} className="flex gap-3 px-2.5 py-2.5">
                  <Skeleton className="size-8 rounded-md" />
                  <div className="flex flex-1 flex-col gap-1.5">
                    <Skeleton className="h-3.5 w-2/5" />
                    <Skeleton className="h-3 w-1/4" />
                  </div>
                </div>
              ))}
            {/* Only once every page is read: a filter can empty one page with more behind it. */}
            {jobs.status === "Exhausted" && jobs.results.length === 0 && (
              <p className="text-muted-foreground px-2.5 py-3 text-[13px]">
                {fits
                  ? "No roles marked as a fit yet. Your loops, and links you check, add them."
                  : filtered
                    ? "No roles match these filters. Try fewer words, or clear a filter."
                    : "No roles yet. The catalog fills as boards are fetched."}
              </p>
            )}
            {compact && jobs.results.length > 0 && (
              <div className={cn(compactRow, "text-muted-foreground py-1 text-xs")}>
                <span>Role</span>
                <span className="hidden md:block">Company</span>
                <span className="hidden md:block">Where</span>
                <span className="hidden md:block">Posted</span>
                <span />
              </div>
            )}
            {jobs.results.map((job) => {
              const where = job.location || "Location not listed"
              const apply = <AutoApplyButton jobId={job._id} status={piled.get(job.url)} />
              const more = (
                <Button
                  size="xs"
                  variant="ghost"
                  render={<Link to="/jobs" search={{ ...search, q: job.title, fits: undefined }} />}
                >
                  More like this
                </Button>
              )
              const open = (
                <Button
                  size="icon-xs"
                  variant="ghost"
                  aria-label={`Open the ${job.title} posting`}
                  render={<a href={job.url} target="_blank" rel="noopener noreferrer" />}
                >
                  <HugeiconsIcon icon={LinkSquare02Icon} />
                </Button>
              )
              const title = (
                <a
                  href={job.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="truncate font-medium hover:underline"
                >
                  {job.title}
                </a>
              )
              return compact ? (
                <div key={job._id} className={cn(compactRow, "hover:bg-accent/30")}>
                  <span className="flex min-w-0 items-center gap-2">
                    {title}
                    <span className="hidden shrink-0 gap-1 lg:flex">
                      <Badges job={job} now={now} />
                    </span>
                  </span>
                  <span className="hidden truncate md:block">{job.company}</span>
                  <span className="text-muted-foreground hidden truncate md:block">{where}</span>
                  <span className="text-muted-foreground hidden tabular-nums md:block">
                    {ago(job.postedAt, now)}
                  </span>
                  <span className="flex items-center justify-end gap-0.5">
                    {apply}
                    {more}
                    {open}
                  </span>
                </div>
              ) : (
                <div
                  key={job._id}
                  className="hover:bg-accent/30 flex items-start gap-3 rounded-md px-2.5 py-2.5 text-[13px]"
                >
                  <Initial company={job.company} />
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex min-w-0 items-baseline gap-2">
                      {title}
                      <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                        {ago(job.postedAt, now)}
                      </span>
                    </div>
                    <span className="text-muted-foreground truncate text-xs">
                      <span className="text-foreground/80">{job.company}</span> · {where}
                    </span>
                    <span className="flex flex-wrap gap-1 empty:hidden">
                      <Badges job={job} now={now} />
                    </span>
                    {job.preview && (
                      <p className="text-muted-foreground line-clamp-2 text-xs leading-relaxed">
                        {job.preview}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-0.5">
                    {apply}
                    {more}
                    {open}
                  </div>
                </div>
              )
            })}
            {jobs.status === "CanLoadMore" && (
              <Button
                size="sm"
                variant="ghost"
                className="m-1 self-start"
                onClick={() => jobs.loadMore(25)}
              >
                Show more
              </Button>
            )}
            {jobs.status === "LoadingMore" && (
              <p className="text-muted-foreground px-2.5 py-2 text-xs">Loading more…</p>
            )}
          </Tile>
        </div>
      </ScrollArea>
    </div>
  )
}
