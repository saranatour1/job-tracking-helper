import { api } from "@/lib/api"
import type { Id } from "@convex/_generated/dataModel"
import { canPrepare } from "@convex/features/jobs/links"
import { groupRoles } from "@convex/features/workflows/fit"
import { PrepareButton } from "@/features/prefilled/prefilled"
import {
  ArrowDown01Icon,
  Cancel01Icon,
  LinkSquare02Icon,
  Search01Icon,
  TaskAdd01Icon,
  TaskDone01Icon,
} from "@hugeicons/core-free-icons"
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
import { useAction, useConvexAuth, useMutation } from "convex/react"
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
import { PageIntro, pageBody } from "@/features/shell/page-body"
import { Breadcrumbs, type Crumb, PageHeader } from "@/features/shell/page-header"
import { messageOf } from "@/features/account/settings"
import { useAccess } from "@/hooks/use-access"
import { postingText } from "@/lib/route-ids"
import { cn } from "@/lib/utils"

import type { Facts } from "@convex/features/jobs/validators"

import { companyRuns } from "./group"
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
  facts: Facts | null
  places: string[]
  fit: number | null
  verdict: "fit" | "notFit" | null
  applicationId: Id<"applications"> | null
  reasons: string[]
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

const factLabels: Record<keyof Facts, string> = {
  level: "Level",
  team: "Team",
  reportsTo: "Reports to",
  workMode: "Work mode",
  travel: "Travel",
  employment: "Type",
  pay: "Pay",
}

export const CompanyLogo = ({ job, className }: { job: Row; className?: string }) =>
  job.evidence.domain ? (
    <img
      src={`/jobs/logo/${job.evidence.domain}`}
      alt=""
      loading="lazy"
      className={cn("size-5 shrink-0 rounded object-contain", className)}
    />
  ) : (
    <span
      aria-hidden
      className={cn(
        "bg-muted text-foreground/80 flex size-5 shrink-0 items-center justify-center rounded text-[10px] font-semibold uppercase",
        className
      )}
    >
      {job.company.trim()[0] ?? "?"}
    </span>
  )

const FactList = ({ facts }: { facts: Facts }) => (
  <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5">
    {(Object.keys(factLabels) as (keyof Facts)[]).map(
      (key) =>
        facts[key] && (
          <div key={key} className="flex flex-col gap-0.5">
            <dt className="text-muted-foreground text-xs">{factLabels[key]}</dt>
            <dd className="text-[13px]">{facts[key]}</dd>
          </div>
        )
    )}
  </dl>
)

/** An action that needs an account, for someone without one: it signs them in and comes back. */
export const SignInFor = ({
  label,
  why,
  size = "sm",
}: {
  label: string
  why: string
  size?: "xs" | "sm"
}) => {
  const here = useRouterState({ select: (s) => s.location.href })
  return (
    <Button
      size={size}
      variant="outline"
      title={why}
      aria-label={`${label}: ${why}`}
      render={<Link to="/sign-in" search={{ redirect: here }} />}
    >
      {label}
    </Button>
  )
}

export const TrackButton = ({
  job,
  size = "sm",
}: {
  job: Pick<Row, "_id" | "company" | "applicationId">
  size?: "xs" | "sm"
}) => {
  const addRole = useMutation(api.jobs.track)
  const router = useRouter()
  const [state, add, adding] = useActionState(
    () =>
      addRole({ jobId: job._id }).then(
        (applicationId) => {
          track("job_track", { source: "jobs" })
          void refreshJobs(router)
          return { applicationId, error: undefined }
        },
        (cause: unknown) => ({ applicationId: undefined, error: messageOf(cause) })
      ),
    undefined
  )
  if (job.applicationId ?? state?.applicationId)
    return (
      <Button size={size} variant="ghost" render={<Link to="/pipeline" />}>
        <HugeiconsIcon icon={TaskDone01Icon} />
        In your tracker
      </Button>
    )
  return (
    <span className="flex flex-col">
      <Button size={size} variant="outline" disabled={adding} onClick={() => startTransition(add)}>
        <HugeiconsIcon icon={TaskAdd01Icon} />
        Add to tracker
      </Button>
      {state?.error && (
        <span role="alert" className="text-destructive max-w-56 text-xs">
          {state.error}
        </span>
      )}
    </span>
  )
}

export type Match = { fit: number; verdict: "fit" | "notFit"; reasons: string[] } | null

/** How a role matches someone signed in: Jev's verdict and why, or a way to ask. Nothing while
 * that's still loading, so the button doesn't flash. */
export const MatchYou = ({ jobId, match }: { jobId: Id<"jobs">; match: Match | undefined }) => {
  const checkJob = useAction(api.loopActions.checkJob)
  const router = useRouter()
  const [error, check, checking] = useActionState(async () => {
    try {
      await checkJob({ jobId })
      track("job_match_checked", { job: jobId })
      await refreshJobs(router)
      return undefined
    } catch (cause) {
      return messageOf(cause)
    }
  }, undefined)
  if (match === undefined) return null
  if (match)
    return (
      <div className="flex flex-col gap-1.5">
        <Badge
          variant={match.verdict === "fit" ? "success" : "outline"}
          className="self-start font-normal"
        >
          {match.verdict === "fit" ? `Matches you · ${match.fit}%` : `Not a match · ${match.fit}%`}
        </Badge>
        {match.reasons.length > 0 && (
          <ul className="text-muted-foreground list-disc space-y-0.5 ps-4 text-xs leading-relaxed">
            {match.reasons.slice(0, 3).map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        )}
      </div>
    )
  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        size="sm"
        variant="outline"
        disabled={checking}
        onClick={() => startTransition(check)}
      >
        {checking ? "Checking…" : "Does it match you?"}
      </Button>
      <span className="text-muted-foreground text-xs">
        Jev reads it against your Preferences, up to 10 roles a day.
      </span>
      {error && (
        <span role="alert" className="text-destructive text-xs">
          {error}
        </span>
      )}
    </div>
  )
}

const splitView = "(min-width: 1024px)"

export const Jobs = () => {
  const data = useLoaderData({ from: "/_app/jobs/" })
  const { member: signedIn } = useAccess()
  const loading = useRouterState({ select: (s) => s.isLoading })
  const search = useSearch({ from: "/_app/jobs/" })
  const visitorWords = search.q === data.allowedSearch ? search.q : undefined
  const { q, remote, posted, board, fits, pages }: JobsSearch = signedIn
    ? search
    : { ...search, q: visitorWords, fits: undefined }
  const [refused, visitorSearch, searching] = useVisitorSearch()
  const navigate = useNavigate({ from: "/jobs/" })
  const set = (patch: Partial<JobsSearch>) => {
    const sameList = Object.keys(patch).every((k) => k === "pages" || k === "role")
    void navigate({
      search: (prev) => ({
        ...prev,
        ...(!sameList && { pages: undefined, role: undefined }),
        ...patch,
      }),
      replace: true,
    })
  }
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
  const noneLeft = data.jobs.isDone && rows.length === 0
  const roles = groupRoles(rows)
  const runs = board ? roles.map((role) => [role]) : companyRuns(roles)
  const lead = (role: Row[]) => role.find((p) => p.verdict) ?? role[0]!
  const picked = roles.find((role) => role.some((p) => p._id === search.role)) ?? roles[0]
  const exact = !filtered
    ? undefined
    : (data.matching ?? (data.jobs.isDone ? rows.length : undefined))
  const total = filtered ? exact : data.stats?.jobs
  const crumbs: Crumb[] = filtered
    ? [
        { label: "Jobs", to: "/jobs" },
        {
          label: [
            q && `“${q}”`,
            remote && "Remote",
            posted && postedLabels[posted],
            company?.label,
            fits && "Best fit for you",
          ]
            .filter(Boolean)
            .join(" · "),
        },
      ]
    : [{ label: "Jobs" }]
  const count =
    exact === undefined
      ? `${rows.length.toLocaleString("en")}+ matches`
      : `${exact.toLocaleString("en")} ${exact === 1 ? "match" : "matches"}`

  const line = (role: Row[], nested = false) => {
    const job = lead(role)
    const fresh = now - job.postedAt < newFor
    const where = job.places
      .filter((p) => p !== "Remote")
      .slice(0, 2)
      .join(", ")
    const selected = picked?.[0]?._id === role[0]!._id
    return (
      <li key={job._id}>
        <Link
          to="/jobs/$id"
          params={{ id: postingText(job) }}
          state={{ jobs: search }}
          preload={false}
          aria-current={selected || undefined}
          onClick={(e) => {
            track("job_opened", { job: job._id, company: job.company })
            if (!window.matchMedia(splitView).matches) return
            e.preventDefault()
            set({ role: job._id })
          }}
          className={cn(
            "hover:bg-accent/40 flex min-h-10 items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] lg:aria-[current]:bg-accent",
            nested && "ps-9"
          )}
        >
          {!nested && <CompanyLogo job={job} />}
          <span className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-2">
            <span className="truncate font-medium">{job.title}</span>
            <span className="text-muted-foreground truncate text-xs">
              {[!nested && job.company, where].filter(Boolean).join(" · ")}
            </span>
          </span>
          {role.length > 1 && (
            <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
              ×{role.length}
            </span>
          )}
          {job.verdict === "fit" && (
            <Badge variant="success" className="shrink-0 font-normal">
              {job.fit}%
            </Badge>
          )}
          {job.remote && (
            <Badge variant="outline" className="hidden shrink-0 font-normal sm:inline-flex">
              Remote
            </Badge>
          )}
          <span
            className={cn(
              "w-8 shrink-0 text-end text-xs tabular-nums",
              fresh ? "text-info-foreground" : "text-muted-foreground"
            )}
            title={fresh ? "New: posted in the last two days" : undefined}
          >
            {ago(job.postedAt, now)}
          </span>
        </Link>
      </li>
    )
  }

  const run = (group: Row[][]) => {
    if (group.length === 1) return line(group[0]!)
    const job = lead(group[0]!)
    const places = [...new Set(group.flatMap((role) => lead(role).places))]
    const shared = places.filter((p) => group.every((role) => lead(role).places.includes(p)))
    return (
      <li key={`run-${job._id}`}>
        <details
          className="group/run"
          open={group.some((role) => role.some((p) => p._id === search.role))}
        >
          <summary className="hover:bg-accent/40 flex min-h-10 cursor-pointer list-none items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] [&::-webkit-details-marker]:hidden">
            <CompanyLogo job={job} />
            <span className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-2">
              <span className="shrink-0 font-medium">
                {job.company} · {group.length} roles
                {shared.length > 0 &&
                  ` in ${shared.filter((p) => p !== "Remote").join(", ") || "Remote"}`}
              </span>
              <span className="text-muted-foreground min-w-0 truncate text-xs group-open/run:hidden">
                {group.map((role) => lead(role).title).join(", ")}
              </span>
            </span>
            <HugeiconsIcon
              icon={ArrowDown01Icon}
              className="text-muted-foreground size-4 shrink-0 transition-transform group-open/run:rotate-180"
            />
            <span className="text-muted-foreground w-8 shrink-0 text-end text-xs tabular-nums">
              {ago(Math.max(...group.map((role) => lead(role).postedAt)), now)}
            </span>
          </summary>
          <ul>{group.map((role) => line(role, true))}</ul>
        </details>
      </li>
    )
  }

  const panel = (role: Row[]) => {
    const job = lead(role)
    const row = role.map((p) => prepared.get(p.url)).find(Boolean)
    const seen = { job: job._id, company: job.company }
    return (
      <aside
        aria-label={job.title}
        className="bg-card sticky top-20 hidden max-h-[calc(100svh-7rem)] flex-col gap-4 overflow-y-auto rounded-xl border p-5 lg:flex"
      >
        <div className="flex items-center gap-2 text-[13px]">
          <CompanyLogo job={job} className="size-6" />
          <span className="font-medium">{job.company}</span>
          <span className="text-muted-foreground">· {ago(job.postedAt, now)} ago</span>
        </div>
        <h2 className="font-heading text-lg leading-snug font-semibold">{job.title}</h2>
        {job.places.length > 0 && (
          <span className="flex flex-wrap gap-1">
            {job.places.map((place) => (
              <Badge key={place} variant="secondary" className="font-normal">
                {place}
              </Badge>
            ))}
          </span>
        )}
        <p className="text-[14px] leading-relaxed">{job.summary ?? job.preview}</p>
        {signedIn && (
          <MatchYou
            jobId={job._id}
            match={
              job.verdict && job.fit !== null
                ? { fit: job.fit, verdict: job.verdict, reasons: job.reasons }
                : null
            }
          />
        )}
        {job.facts && <FactList facts={job.facts} />}
        <span className="flex flex-wrap gap-1 empty:hidden">
          <Evidence job={job} now={now} short />
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            onClick={() => track("job_apply_link", seen)}
            render={<a href={job.url} {...external} />}
          >
            <HugeiconsIcon icon={LinkSquare02Icon} />
            Apply
          </Button>
          {signedIn ? (
            <TrackButton job={job} />
          ) : (
            <SignInFor label="Add to tracker" why="Sign in to keep this role on your board" />
          )}
          {canPrepare(job.url) &&
            (signedIn ? (
              <PrepareButton jobId={job._id} status={row?.status} prefillId={row?._id} />
            ) : (
              <SignInFor label="Prepare" why="Sign in to have its application filled in for you" />
            ))}
          {signedIn ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => track("job_more_like_this", seen)}
              render={
                <Link
                  to="/jobs"
                  search={{
                    ...search,
                    q: job.title,
                    fits: undefined,
                    pages: undefined,
                    role: undefined,
                  }}
                />
              }
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
                find(job.title)
              }}
            >
              More like this
            </Button>
          )}
        </div>
        <Link
          to="/jobs/$id"
          params={{ id: postingText(job) }}
          state={{ jobs: search }}
          className="text-muted-foreground text-xs hover:underline"
        >
          The full posting
        </Link>
      </aside>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {signedIn && <PageHeader crumbs={crumbs} />}
      <ScrollArea className="min-h-0 flex-1" restoreId="jobs">
        <div id="jobs-top" className={cn(pageBody, "max-w-6xl gap-4")}>
          {!signedIn && filtered && <Breadcrumbs crumbs={crumbs} className="-mb-2" />}
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
            <p role="alert" className="text-destructive -mt-2 text-[13px]">
              {refused}
            </p>
          )}

          <div className="bg-background/95 supports-[backdrop-filter]:bg-background/80 z-10 -mx-2 flex flex-wrap md:sticky md:top-0 items-center gap-2 px-2 py-2 backdrop-blur">
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
              <Select
                value={fits ? "fit" : "newest"}
                items={[
                  { value: "newest", label: q ? "Best match" : "Newest first" },
                  ...(signedIn ? [{ value: "fit", label: "Best fit for you" }] : []),
                ]}
                onValueChange={(v) => set({ fits: v === "fit" || undefined })}
              >
                <SelectTrigger size="sm" aria-label="Sort" className="w-auto min-w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectPopup>
                  <SelectItem value="newest">{q ? "Best match" : "Newest first"}</SelectItem>
                  {signedIn && <SelectItem value="fit">Best fit for you</SelectItem>}
                </SelectPopup>
              </Select>
              {filtered && (
                <Button size="sm" variant="ghost" render={<Link to="/jobs" />}>
                  <HugeiconsIcon icon={Cancel01Icon} />
                  Clear
                </Button>
              )}
            </div>
            {filtered && (
              <span role="status" className="text-muted-foreground ms-auto text-xs tabular-nums">
                {count}
              </span>
            )}
          </div>

          <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_24rem]">
            <div className="flex min-w-0 flex-col">
              {noneLeft && (
                <p className="text-muted-foreground px-2.5 py-3 text-[13px]">
                  {fits
                    ? "No roles marked as a fit yet. Your loops, and links you check, add them."
                    : filtered
                      ? "No roles match. Try fewer words, or clear a filter."
                      : "No roles yet. The catalog fills as boards are fetched."}
                </p>
              )}
              <ul className="flex flex-col">{runs.map(run)}</ul>
              <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 px-1 pt-2 text-xs empty:hidden">
                {/* A link, not a button, so crawlers follow it to the next page of roles. */}
                {!data.jobs.isDone && (pages ?? 1) < maxPages && (
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-disabled={loading || undefined}
                    onClick={() => track("job_show_more")}
                    render={
                      <Link
                        to="/jobs"
                        search={(prev) => ({ ...prev, pages: (pages ?? 1) + 1, role: undefined })}
                        replace
                        resetScroll={false}
                      />
                    }
                  >
                    {loading ? "Loading more…" : "Show more"}
                  </Button>
                )}
                {rows.length > 0 && (total ?? 0) > rows.length && (
                  <span className="tabular-nums">
                    Showing {rows.length.toLocaleString("en")} of {total!.toLocaleString("en")}
                  </span>
                )}
                {(pages ?? 1) > 1 && (
                  <button
                    type="button"
                    className="hover:underline"
                    onClick={() =>
                      document.getElementById("jobs-top")?.scrollIntoView({ behavior: "smooth" })
                    }
                  >
                    Back to the top
                  </button>
                )}
              </div>
            </div>
            {picked && panel(picked)}
          </div>
        </div>
      </ScrollArea>
    </div>
  )
}
