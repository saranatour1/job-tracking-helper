import { api } from "@/lib/api"
import type { Id } from "@convex/_generated/dataModel"
import { canPrepare } from "@convex/features/jobs/links"
import { groupRoles } from "@convex/features/workflows/fit"
import { PrepareButton } from "@/features/prefilled/prefilled"
import { Cancel01Icon, LinkSquare02Icon, Search01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useSignInAnonymously } from "@convex-dev/auth/methods/anonymous/react"
import { track } from "@databuddy/sdk"
import {
  Link,
  useLoaderData,
  useNavigate,
  useRouter,
  useRouterState,
  useSearch,
} from "@tanstack/react-router"
import { useConvexAuth, useMutation } from "convex/react"
import { startTransition, useActionState } from "react"

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
import { Toggle } from "@/components/ui/toggle"
import { PageIntro, pageBody, Tile } from "@/features/shell/page-body"
import { PageHeader } from "@/features/shell/page-header"
import { messageOf } from "@/features/account/settings"
import { useAccess } from "@/hooks/use-access"
import { postingText } from "@/lib/route-ids"
import { cn } from "@/lib/utils"

import { type JobsSearch, maxPages, type Posted, refreshJobs } from "./search"

const postedLabels: Record<Posted | "any", string> = {
  any: "Any time",
  day: "Past day",
  week: "Past week",
  month: "Past month",
}

const hour = 60 * 60 * 1000
const dayMs = 24 * hour

// "3h", "2d", "5w": how long ago a role was posted.
export const ago = (ms: number, now: number) => {
  const hours = Math.max(0, Math.floor((now - ms) / hour))
  if (hours < 24) return `${hours || 1}h`
  const days = Math.floor(hours / 24)
  return days < 14 ? `${days}d` : `${Math.floor(days / 7)}w`
}

export type Row = {
  _id: Id<"jobs">
  url: string
  title: string
  company: string
  location: string
  remote: boolean
  postedAt: number
  preview: string
  summary: string | null
  places: string[]
  fit: number | null
  verdict: "fit" | "notFit" | null
  evidence: {
    boardId: Id<"jobBoards"> | null
    domain: string | null
    link: "postings" | "name" | null
    yc: { batch: string; status: string; url: string; teamSize?: number } | null
    registeredAt: number | null
    open: number | null
    pooled: boolean
  }
}

const yearMs = 365.25 * dayMs
const newFor = 2 * dayMs

// "9 months", "12 years".
const ageOf = (ms: number, now: number) => {
  const years = Math.floor((now - ms) / yearMs)
  if (years >= 1) return `${years} ${years === 1 ? "year" : "years"}`
  const months = Math.max(1, Math.floor(((now - ms) / yearMs) * 12))
  return `${months} ${months === 1 ? "month" : "months"}`
}

export const external = { target: "_blank", rel: "noopener noreferrer" }

// How a role ties to its company. `short` is for where the domain is already on show.
const ProofBadge = ({ job, short }: { job: Row; short?: boolean }) => {
  const { domain, link } = job.evidence
  if (!domain)
    return (
      <Badge
        variant="warning"
        className="font-normal"
        title="No company site found for this role yet. Check the company yourself before applying."
      >
        Unverified
      </Badge>
    )
  return link === "postings" ? (
    <Badge
      variant="success"
      className="font-normal"
      title={`This board's postings live on ${domain}.`}
    >
      {short ? "Own site" : `On ${domain}`}
    </Badge>
  ) : (
    <Badge
      variant="outline"
      className="font-normal"
      title={`Found by searching the company's name: ${domain}. A copied name would match too, so what's shown is about that site, not proof it's this board.`}
    >
      {short ? "Name only" : `Name matches ${domain}`}
    </Badge>
  )
}

// What was found about a role's company, for the person to weigh. Never a verdict: most real
// employers aren't in YC, and a scammer can copy a real name.
export const Evidence = ({ job, now, short }: { job: Row; now: number; short?: boolean }) => {
  const { domain, yc, registeredAt } = job.evidence
  if (!domain) return <ProofBadge job={job} />
  return (
    <>
      <ProofBadge job={job} short={short} />
      {yc && (
        <Badge
          variant="outline"
          className="font-normal"
          title={yc.teamSize ? `About ${yc.teamSize} people, per the YC directory` : undefined}
          render={<a href={yc.url} {...external} />}
        >
          YC {yc.batch}
          {yc.status !== "Active" && ` · ${yc.status}`}
        </Badge>
      )}
      {registeredAt !== null && (
        <Badge
          variant={now - registeredAt < yearMs ? "warning" : "outline"}
          className="font-normal"
          title={`${domain} was registered in ${new Date(registeredAt).getUTCFullYear()}`}
        >
          Domain {ageOf(registeredAt, now)}
        </Badge>
      )}
    </>
  )
}

// What's worth seeing first about a role: remote, new, and what Jev thought of it. Under a domain,
// the lanes already say the last two.
export const Badges = ({
  job,
  openings,
  now,
  nested,
}: {
  job: Row
  openings: number
  now: number
  nested?: boolean
}) => (
  <>
    {job.verdict && (
      <Badge variant={job.verdict === "fit" ? "success" : "outline"} className="font-normal">
        {job.verdict === "fit" ? `Fits you · ${job.fit}%` : "Not a fit"}
      </Badge>
    )}
    {openings > 1 && (
      <Badge variant="outline" className="font-normal">
        {openings} openings
      </Badge>
    )}
    {!nested && now - job.postedAt < newFor && (
      <Badge variant="info" className="font-normal">
        New
      </Badge>
    )}
    {!nested && job.remote && (
      <Badge variant="outline" className="font-normal">
        Remote
      </Badge>
    )}
  </>
)

/** Searching without an account: makes the anonymous account on the first search, not on page
 * load, so crawlers don't make any, then spends one of its daily searches. */
export const useVisitorSearch = () => {
  const { isAuthenticated } = useConvexAuth()
  const { signIn } = useSignInAnonymously(api.auth)
  const allow = useMutation(api.jobs.allowSearch)
  const navigate = useNavigate()
  const router = useRouter()
  return useActionState(async (_: string | undefined, words: string) => {
    try {
      if (!isAuthenticated) await signIn()
      await allow({ q: words })
    } catch (cause) {
      track("job_search_refused", { query: words })
      return messageOf(cause)
    }
    track("job_search", { query: words, member: false })
    await refreshJobs(router, words)
    await navigate({ to: "/jobs", search: { q: words } })
    return undefined
  }, undefined)
}

// Every role in the shared catalog, newest first or by what was searched for, with what each one is
// and where. Members also get Fits me, Jev's verdicts and Prepare.
export const Jobs = () => {
  const data = useLoaderData({ from: "/_app/jobs/" })
  const { member: signedIn } = useAccess()
  const loading = useRouterState({ select: (s) => s.isLoading })
  const search = useSearch({ from: "/_app/jobs/" })
  // A shared link can carry words nobody has spent a search on yet. Those wait in the box until
  // someone presses Search.
  const { q, remote, posted, board, fits, pages }: JobsSearch = signedIn
    ? search
    : { ...search, q: search.q === data.allowedSearch ? search.q : undefined, fits: undefined }
  const [refused, visitorSearch, searching] = useVisitorSearch()
  const navigate = useNavigate({ from: "/jobs/" })
  const set = (patch: Partial<JobsSearch>) =>
    void navigate({
      search: (prev) => ({ ...prev, ...(!("pages" in patch) && { pages: undefined }), ...patch }),
      replace: true,
    })
  const find = (words: string) => {
    if (words && !signedIn) return startTransition(() => visitorSearch(words))
    if (words) track("job_search", { query: words, member: true })
    set({ q: words || undefined })
  }
  const now = Date.now()
  const prepared = new Map(data.prepared.map((r) => [r.url, r]))
  const options = data.companies.map((c) => ({
    value: c.boardId,
    label: c.company,
    domain: c.domain,
    jobs: c.jobs,
  }))
  const company = options.find((o) => o.value === board) ?? null
  const filtered = Boolean(q || remote || posted || board || fits)
  const rows = data.jobs.page
  const heading = fits
    ? "Roles that fit you, best first"
    : q
      ? `Best matches for “${q}”`
      : "Newest first"

  const roleRow = (postings: Row[]) => {
    const job = postings.find((p) => p.verdict) ?? postings[0]!
    const seen = { job: job._id, company: job.company }
    const row = postings.map((p) => prepared.get(p.url)).find(Boolean)
    const fresh = now - job.postedAt < newFor
    return (
      <li
        key={job._id}
        className="flex flex-col gap-2 border-t px-3 py-3.5 first:border-t-0 sm:flex-row sm:items-start sm:gap-4"
      >
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <Link
              to="/jobs/$id"
              params={{ id: postingText(job) }}
              onClick={() => track("job_opened", seen)}
              className="font-heading text-[15px] font-semibold hover:underline"
            >
              {job.title}
            </Link>
            <span className="text-muted-foreground text-xs">
              {job.company} ·{" "}
              <span
                className={cn("tabular-nums", fresh && "text-info-foreground")}
                title={fresh ? "New: posted in the last two days" : undefined}
              >
                {ago(job.postedAt, now)} ago
              </span>
              {postings.length > 1 && ` · ${postings.length} openings`}
            </span>
          </div>
          <p className="text-foreground/80 line-clamp-2 max-w-prose text-[13px] leading-relaxed">
            {job.summary ?? job.preview}
          </p>
          <div className="flex flex-wrap gap-1 empty:hidden">
            {job.verdict && (
              <Badge
                variant={job.verdict === "fit" ? "success" : "outline"}
                className="font-normal"
              >
                {job.verdict === "fit" ? `Fits you · ${job.fit}%` : "Not a fit"}
              </Badge>
            )}
            {job.places.map((place) => (
              <Badge key={place} variant="secondary" className="font-normal">
                {place}
              </Badge>
            ))}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {signedIn && canPrepare(job.url) && (
            <PrepareButton jobId={job._id} status={row?.status} prefillId={row?._id} />
          )}
          {signedIn ? (
            <Button
              size="xs"
              variant="ghost"
              onClick={() => track("job_more_like_this", seen)}
              render={
                <Link
                  to="/jobs"
                  search={{ ...search, q: job.title, fits: undefined, pages: undefined }}
                />
              }
            >
              More like this
            </Button>
          ) : (
            <Button
              size="xs"
              variant="ghost"
              disabled={searching}
              onClick={() => {
                track("job_more_like_this", seen)
                find(job.title)
              }}
            >
              More like this
            </Button>
          )}
          <Button
            size="icon-xs"
            variant="ghost"
            aria-label={`Open the ${job.title} posting`}
            onClick={() => track("job_apply_link", seen)}
            render={<a href={job.url} {...external} />}
          >
            <HugeiconsIcon icon={LinkSquare02Icon} />
          </Button>
        </div>
      </li>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {signedIn && <PageHeader crumbs={[{ label: "Jobs" }]} />}
      <ScrollArea className="min-h-0 flex-1">
        <div className={pageBody}>
          <PageIntro
            title="Jobs"
            description={
              data.stats
                ? `${data.stats.jobs.toLocaleString("en")} open roles from company job boards, refreshed daily.`
                : "Open roles from company job boards, refreshed daily."
            }
          >
            <Button size="sm" variant="outline" render={<Link to="/jobs/trends" />}>
              Trends
            </Button>
          </PageIntro>

          <div className="flex flex-col gap-3">
            <form
              className="flex items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                const said = new FormData(e.currentTarget).get("q")
                find(typeof said === "string" ? said.trim() : "")
              }}
            >
              <div className="relative max-w-xl flex-1">
                <HugeiconsIcon
                  icon={Search01Icon}
                  className="text-muted-foreground pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2"
                />
                <Input
                  key={search.q}
                  name="q"
                  type="search"
                  aria-label="Search roles"
                  placeholder="Search by title, skill or place"
                  defaultValue={search.q}
                  className="ps-8"
                />
              </div>
              <Button type="submit" variant="outline" disabled={searching}>
                Search
              </Button>
            </form>
            {refused && (
              <p role="alert" className="text-destructive text-[13px]">
                {refused}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filters">
              <Toggle
                size="sm"
                variant="outline"
                pressed={Boolean(remote)}
                onPressedChange={(on) => set({ remote: on || undefined })}
              >
                Remote
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
                  className="w-52"
                  aria-label="Company"
                  placeholder="Any company"
                />
                <ComboboxPopup>
                  <ComboboxEmpty>No company matches.</ComboboxEmpty>
                  <ComboboxList>
                    {(option: (typeof options)[number]) => (
                      <ComboboxItem key={option.value} value={option}>
                        <span className="truncate">{option.label}</span>
                        {option.domain && (
                          <span className="text-muted-foreground truncate text-xs">
                            {option.domain}
                          </span>
                        )}
                        <span className="text-muted-foreground ms-auto ps-3 text-xs tabular-nums">
                          {option.jobs}
                        </span>
                      </ComboboxItem>
                    )}
                  </ComboboxList>
                </ComboboxPopup>
              </Combobox>
              {signedIn && (
                <Toggle
                  size="sm"
                  variant="outline"
                  pressed={Boolean(fits)}
                  onPressedChange={(on) => set({ fits: on || undefined })}
                >
                  Fits me
                </Toggle>
              )}
              {filtered && (
                <Button size="sm" variant="ghost" render={<Link to="/jobs" />}>
                  <HugeiconsIcon icon={Cancel01Icon} />
                  Clear
                </Button>
              )}
            </div>
          </div>

          <Tile title={heading} className="gap-0 p-1.5">
            {/* Only once every page is read: a filter can empty one page with more behind it. */}
            {data.jobs.isDone && rows.length === 0 && (
              <p className="text-muted-foreground px-2.5 py-3 text-[13px]">
                {fits
                  ? "No roles marked as a fit yet. Your loops, and links you check, add them."
                  : filtered
                    ? "No roles match. Try fewer words, or clear a filter."
                    : "No roles yet. The catalog fills as boards are fetched."}
              </p>
            )}
            <ul className="flex flex-col">{groupRoles(rows).map(roleRow)}</ul>
            {!data.jobs.isDone && (pages ?? 1) < maxPages && (
              <Button
                size="sm"
                variant="ghost"
                className="m-1 self-start"
                disabled={loading}
                onClick={() => {
                  track("job_show_more")
                  set({ pages: (pages ?? 1) + 1 })
                }}
              >
                {loading ? "Loading more…" : "Show more"}
              </Button>
            )}
          </Tile>
        </div>
      </ScrollArea>
    </div>
  )
}
