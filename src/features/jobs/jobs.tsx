import { api } from "@/lib/api"
import type { Id } from "@convex/_generated/dataModel"
import { domainSaysName, groupDomains, type Proof, proofs } from "@convex/features/jobs/domains"
import { canPrepare } from "@convex/features/jobs/links"
import { rowLimits } from "@convex/features/preferences/rows"
import { groupRoles } from "@convex/features/workflows/fit"
import { PrepareButton } from "@/features/prefilled/prefilled"
import {
  ArrowRight01Icon,
  Cancel01Icon,
  LinkSquare02Icon,
  Search01Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useSignInAnonymously } from "@convex-dev/auth/methods/anonymous/react"
import { track } from "@databuddy/sdk"
import { Link, useNavigate, useSearch } from "@tanstack/react-router"
import { useConvexAuth, useMutation } from "convex/react"
import { usePaginatedQuery, useQuery } from "convex-helpers/react/cache/hooks"
import { startTransition, useActionState, useMemo } from "react"

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
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { PageIntro, pageBody, Tile } from "@/features/shell/page-body"
import { PageHeader } from "@/features/shell/page-header"
import { messageOf } from "@/features/account/settings"
import { useAccess } from "@/hooks/use-access"
import { postingText } from "@/lib/route-ids"
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
  // Roles one after another, instead of under their domains.
  view?: "roles"
  collapsed?: boolean
  posted?: Posted
  // A board id; the server finds nothing for one that isn't.
  board?: string
  fits?: boolean
  proof?: Proof
  // A domain ending, like ".ai"; the server finds nothing for one that isn't.
  ending?: string
}

// Reads the page's filters from the address, dropping anything it doesn't know.
export const jobsSearch = (search: Record<string, unknown>): JobsSearch => ({
  q: typeof search.q === "string" && search.q.trim() ? search.q.slice(0, 200) : undefined,
  remote: search.remote === true ? true : undefined,
  view: search.view === "roles" ? "roles" : undefined,
  collapsed: search.collapsed === true ? true : undefined,
  posted:
    typeof search.posted === "string" && search.posted in postedWithin
      ? (search.posted as Posted)
      : undefined,
  board: typeof search.board === "string" && search.board ? search.board : undefined,
  fits: search.fits === true ? true : undefined,
  proof: proofs.includes(search.proof as Proof) ? (search.proof as Proof) : undefined,
  ending:
    typeof search.ending === "string" && /^\.[a-z0-9-]{1,63}$/.test(search.ending)
      ? search.ending
      : undefined,
})

const hour = 60 * 60 * 1000
const dayMs = 24 * hour

// "3h", "2d", "5w": how long ago a role was posted.
export const ago = (ms: number, now: number) => {
  const hours = Math.max(0, Math.floor((now - ms) / hour))
  if (hours < 24) return `${hours || 1}h`
  const days = Math.floor(hours / 24)
  return days < 14 ? `${days}d` : `${Math.floor(days / 7)}w`
}

// The lanes a domain and its roles share: chevron and initial, name, postings, registered, YC, open
// and newest.
const laneColumns = "md:grid-cols-[3.5rem_minmax(0,1fr)_6rem_5.5rem_3.5rem_3.5rem_3rem]"

// A company with more roles than this starts closed, showing their titles on one line.
const closedFrom = 250

export type Row = {
  _id: Id<"jobs">
  url: string
  title: string
  company: string
  location: string
  remote: boolean
  postedAt: number
  preview: string
  fit: number | null
  verdict: "fit" | "notFit" | null
  evidence: {
    boardId: Id<"jobBoards"> | null
    domain: string | null
    link: "postings" | "name" | null
    yc: { batch: string; status: string; url: string; teamSize?: number } | null
    registeredAt: number | null
    open: number | null
  }
}

const yearMs = 365.25 * dayMs
const newFor = 2 * dayMs
const endingsShown = 6

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

// How long ago a role was posted, in blue while it's new.
const Posted = ({ at, now }: { at: number; now: number }) => (
  <span
    className={cn(
      "text-end tabular-nums",
      now - at < newFor ? "text-info-foreground" : "text-muted-foreground"
    )}
    title={now - at < newFor ? "New: posted in the last two days" : undefined}
  >
    {ago(at, now)}
  </span>
)

// A link out only: LinkedIn's terms rule out reading it.
const LinkedIn = ({ company }: { company: string }) => (
  <a
    href={`https://www.linkedin.com/search/results/companies/?keywords=${encodeURIComponent(company)}`}
    {...external}
    className="hover:underline"
  >
    LinkedIn
  </a>
)

const Initial = ({ company }: { company: string }) => (
  <span
    aria-hidden
    className="bg-muted text-foreground/80 flex size-8 shrink-0 items-center justify-center rounded-md text-xs font-semibold uppercase"
  >
    {company.trim()[0] ?? "?"}
  </span>
)

// A domain's own row, and its roles when it's open. A native <details>, so opening one holds no
// state and survives every rerender.
const Domain = ({
  jobs,
  now,
  collapsed,
  canNarrow,
  children,
}: {
  jobs: Row[]
  now: number
  collapsed: boolean
  // A link to all of a board's roles means something only with the filters.
  canNarrow: boolean
  children: React.ReactNode
}) => {
  const first = jobs[0]!
  const { boardId, domain, yc, registeredAt, open } = first.evidence
  const count = Math.max(open ?? 0, jobs.length)
  const more = canNarrow && boardId ? count - jobs.length : 0
  return (
    <details open={!collapsed && count <= closedFrom} className="group/domain border-t py-1.5">
      <summary
        className={cn(
          "hover:bg-accent/30 grid min-h-11 cursor-pointer list-none grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 rounded-md px-2.5 py-1.5 text-[13px] [&::-webkit-details-marker]:hidden",
          laneColumns
        )}
      >
        <span className="flex items-center gap-2">
          <HugeiconsIcon
            icon={ArrowRight01Icon}
            className="text-muted-foreground size-4 shrink-0 transition-transform group-open/domain:rotate-90"
          />
          <Initial company={first.company} />
        </span>
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="flex min-w-0 flex-wrap items-baseline gap-x-2">
            {domain ? (
              <a
                href={`https://${domain}`}
                {...external}
                className="font-heading max-w-full truncate text-[15px] font-semibold hover:underline"
              >
                {domain}
              </a>
            ) : (
              <span className="font-heading max-w-full truncate text-[15px] font-semibold">
                {first.company}
              </span>
            )}
            <span className="text-muted-foreground text-xs">
              {domain
                ? !domainSaysName(domain, first.company) && `${first.company} · `
                : "No company site found · "}
              <LinkedIn company={first.company} />
            </span>
          </span>
          <span className="text-muted-foreground truncate text-xs group-open/domain:hidden">
            {[...new Set(jobs.map((j) => j.title.trim()))].join(", ")}
          </span>
          <span className="text-muted-foreground flex flex-wrap items-center gap-1 pt-0.5 text-xs md:hidden">
            <Evidence job={first} now={now} short />
            <span className="tabular-nums">{count.toLocaleString("en")} open</span>
          </span>
        </span>
        <span className="hidden md:flex">
          <ProofBadge job={first} short />
        </span>
        <span className="text-muted-foreground hidden md:flex">
          {registeredAt === null ? (
            "—"
          ) : now - registeredAt < yearMs ? (
            <Badge variant="warning" className="font-normal">
              {ageOf(registeredAt, now)}
            </Badge>
          ) : (
            ageOf(registeredAt, now)
          )}
        </span>
        <span className="hidden md:flex">
          {yc && (
            <Badge
              variant="outline"
              className="font-normal"
              title={`YC ${yc.batch}${yc.status === "Active" ? "" : `, ${yc.status}`}`}
              render={<a href={yc.url} {...external} />}
            >
              {`${yc.batch.startsWith("Spring") ? "X" : yc.batch[0]}${yc.batch.slice(-2)}`}
            </Badge>
          )}
        </span>
        <span className="hidden text-end font-medium tabular-nums md:block">
          {count.toLocaleString("en")}
        </span>
        <Posted at={Math.max(...jobs.map((j) => j.postedAt))} now={now} />
      </summary>
      {children}
      {more > 0 && (
        <Button
          size="xs"
          variant="ghost"
          className="text-muted-foreground ms-4 md:ms-19.5"
          render={<Link to="/jobs" search={{ board: boardId ?? undefined }} />}
        >
          Show {more.toLocaleString("en")} more
        </Button>
      )}
    </details>
  )
}

// The whole catalog at a glance, and filters for anyone signed in. A stored summary, so a few hours
// behind a board's latest fetch at most.
const Overview = ({
  summary,
  signedIn,
  proof,
  ending,
  set,
}: {
  summary: {
    own: number
    name: number
    unverified: number
    endings: { ending: string; jobs: number }[]
  }
  signedIn: boolean
  proof?: Proof
  ending?: string
  set: (patch: Partial<JobsSearch>) => void
}) => {
  const parts = [
    { key: "own", label: "Own site", bar: "bg-success", text: "text-success-foreground" },
    {
      key: "name",
      label: "Name only",
      bar: "bg-muted-foreground/50",
      text: "text-muted-foreground",
    },
    { key: "unverified", label: "Unverified", bar: "bg-warning", text: "text-warning-foreground" },
  ] as const
  const shown = summary.endings.slice(0, endingsShown)
  const other = summary.endings.slice(endingsShown).reduce((n, e) => n + e.jobs, 0)
  return (
    <div className="grid gap-3 md:grid-cols-[5fr_4fr]">
      <Tile title="How roles tie to a company" className="gap-3">
        <div aria-hidden className="flex h-2 gap-0.5 px-1">
          {parts.map((p) => (
            <div
              key={p.key}
              className={cn("rounded-[2px]", p.bar)}
              style={{ flexGrow: summary[p.key] }}
            />
          ))}
        </div>
        <div className="grid grid-cols-3 gap-2">
          {parts.map((p) => (
            <Toggle
              key={p.key}
              disabled={!signedIn}
              pressed={proof === p.key}
              onPressedChange={(on) => set({ proof: on ? p.key : undefined })}
              className="h-auto flex-col items-start gap-0.5 rounded-md px-1 py-0.5 disabled:opacity-100 sm:h-auto"
            >
              <span className="font-heading text-xl font-semibold tabular-nums">
                {summary[p.key].toLocaleString("en")}
              </span>
              <span className={cn("text-xs font-normal", p.text)}>{p.label}</span>
            </Toggle>
          ))}
        </div>
      </Tile>
      <Tile title="Domain ending" className="gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {shown.map((e) => (
            <Toggle
              key={e.ending}
              size="sm"
              variant="outline"
              disabled={!signedIn}
              pressed={ending === e.ending}
              onPressedChange={(on) => set({ ending: on ? e.ending : undefined })}
              className="disabled:opacity-100"
            >
              {e.ending}
              <span className="text-muted-foreground font-normal tabular-nums">
                {e.jobs.toLocaleString("en")}
              </span>
            </Toggle>
          ))}
          {other > 0 && (
            <span className="text-muted-foreground px-1.5 text-[13px] tabular-nums">
              Other {other.toLocaleString("en")}
            </span>
          )}
        </div>
      </Tile>
    </div>
  )
}

/** Searching without an account: makes the anonymous account on the first search, not on page
 * load, so crawlers don't make any, then spends one of its daily searches. */
export const useVisitorSearch = () => {
  const { isAuthenticated } = useConvexAuth()
  const { signIn } = useSignInAnonymously(api.auth)
  const allow = useMutation(api.jobs.allowSearch)
  const navigate = useNavigate()
  return useActionState(async (_: string | undefined, words: string) => {
    try {
      if (!isAuthenticated) await signIn()
      await allow({ q: words })
    } catch (cause) {
      track("job_search_refused", { query: words })
      return messageOf(cause)
    }
    track("job_search", { query: words, member: false })
    await navigate({ to: "/jobs", search: { q: words } })
    return undefined
  }, undefined)
}

// Every role in the shared catalog, under its company's domain. Search it, narrow it down, and from
// any role find more like it. Roles a loop or a pasted link judged show Jev's verdict for you. Signed out it's
// the same list to search, without the filters or anything about you.
export const Jobs = () => {
  const { member: signedIn, allowedSearch } = useAccess()
  const search = useSearch({ from: "/_app/jobs/" })
  // A shared link can carry filters, which mean nothing signed out, and words nobody has spent a
  // search on yet. Those wait in the box until someone presses Search.
  const { q, remote, view, collapsed, posted, board, fits, proof, ending }: JobsSearch = signedIn
    ? search
    : {
        q: search.q === allowedSearch ? search.q : undefined,
        view: search.view,
        collapsed: search.collapsed,
      }
  const [refused, visitorSearch, searching] = useVisitorSearch()
  const navigate = useNavigate({ from: "/jobs/" })
  const set = (patch: Partial<JobsSearch>) =>
    void navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true })
  const find = (words: string) => {
    if (words && !signedIn) return startTransition(() => visitorSearch(words))
    if (words) track("job_search", { query: words, member: true })
    set({ q: words || undefined })
  }
  const now = Date.now()
  // Fixed when the filter is picked, so a re-render past the hour doesn't reset the list;
  // rounded to the hour so the same filters ask the same question for a while.
  const since = useMemo(
    () =>
      posted ? Math.floor(Date.now() / hour) * hour - postedWithin[posted] * dayMs : undefined,
    [posted]
  )
  const stats = useQuery(api.jobs.stats)
  const companies = useQuery(api.jobs.companies, signedIn ? {} : "skip") ?? []
  // Roles already prepared, by posting, for their badge.
  const prepared = new Map(
    (useQuery(api.prefilled.list, signedIn ? {} : "skip") ?? []).map((r) => [r.url, r])
  )
  // Keyed by board, since two boards can share a company name.
  const options = companies.map((c) => ({
    value: c.boardId,
    label: c.domain ? `${c.domain} · ${c.company}` : c.company,
    jobs: c.jobs,
  }))
  const company = options.find((o) => o.value === board) ?? null
  const tags = usePaginatedQuery(api.preferences.tags, signedIn ? {} : "skip", {
    initialNumItems: rowLimits.tags,
  })
  const suggestions = [
    ...new Set(
      tags.results
        .filter((t) => t.kind === "interest" || t.kind === "location" || t.kind === "company")
        .map((t) => t.value)
    ),
  ].slice(0, 8)
  const jobs = usePaginatedQuery(
    api.jobs.search,
    { q, remoteOnly: remote, boardId: board, since, fits, proof, ending },
    { initialNumItems: 25 }
  )
  const filtered = Boolean(q || remote || posted || board || fits || proof || ending)
  const heading = fits
    ? "Roles that fit you, best first"
    : q
      ? `Best matches for “${q}”`
      : "Newest first"

  const partsOf = (postings: Row[]) => {
    const job = postings.find((p) => p.verdict) ?? postings[0]!
    const where = job.location || "Location not listed"
    const row = postings.map((p) => prepared.get(p.url)).find(Boolean)
    const apply = signedIn && canPrepare(job.url) && (
      <PrepareButton jobId={job._id} status={row?.status} prefillId={row?._id} />
    )
    const seen = { job: job._id, company: job.company }
    const more = signedIn ? (
      <Button
        size="xs"
        variant="ghost"
        onClick={() => track("job_more_like_this", seen)}
        render={<Link to="/jobs" search={{ ...search, q: job.title, fits: undefined }} />}
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
    )
    const open = (
      <Button
        size="icon-xs"
        variant="ghost"
        aria-label={`Open the ${job.title} posting`}
        onClick={() => track("job_apply_link", seen)}
        render={<a href={job.url} target="_blank" rel="noopener noreferrer" />}
      >
        <HugeiconsIcon icon={LinkSquare02Icon} />
      </Button>
    )
    const title = (wrap: boolean) => (
      <Link
        to="/jobs/$id"
        params={{ id: postingText(job) }}
        onClick={() => track("job_opened", seen)}
        className={cn(
          "hover:underline",
          wrap ? "min-w-0 font-medium sm:truncate" : "min-w-0 md:truncate"
        )}
      >
        {job.title}
      </Link>
    )
    return {
      job,
      where,
      title,
      apply,
      more,
      open,
      actions: (
        <>
          {apply}
          {more}
          {open}
        </>
      ),
    }
  }

  const roleRow = (postings: Row[]) => {
    const { job, where, title, actions } = partsOf(postings)
    return (
      <div
        key={job._id}
        className="hover:bg-accent/30 grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 gap-y-1.5 rounded-md px-2.5 py-2.5 text-[13px] sm:grid-cols-[auto_minmax(0,1fr)_auto]"
      >
        <Initial company={job.company} />
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex min-w-0 items-baseline gap-2">
            {title(true)}
            <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
              {ago(job.postedAt, now)}
            </span>
          </div>
          <span className="text-muted-foreground truncate text-xs">
            <span className="text-foreground/80">{job.company}</span> · {where} ·{" "}
            <LinkedIn company={job.company} />
          </span>
          <span className="flex flex-wrap gap-1 empty:hidden">
            <Badges job={job} openings={postings.length} now={now} />
            <Evidence job={job} now={now} />
          </span>
          {job.preview && (
            <p className="text-muted-foreground line-clamp-2 text-xs leading-relaxed">
              {job.preview}
            </p>
          )}
        </div>
        <div className="col-start-2 flex flex-wrap items-center gap-0.5 sm:col-start-3">
          {actions}
        </div>
      </div>
    )
  }

  // One line under its domain, with the actions in place of where it is while hovered. A touch
  // screen can't hover, so it shows both.
  const nestedRow = (postings: Row[]) => {
    const { job, where, title, apply, more, open } = partsOf(postings)
    return (
      <div
        key={job._id}
        className={cn(
          "group/role hover:bg-accent/30 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 rounded-md py-1.5 ps-4 pe-2.5 text-[13px] md:min-h-8 md:py-0 md:ps-2.5",
          laneColumns
        )}
      >
        <span className="flex min-w-0 flex-wrap items-center gap-x-2 md:col-start-2 md:flex-nowrap">
          {title(false)}
          <span className="flex shrink-0 gap-1 empty:hidden">
            <Badges job={job} openings={postings.length} now={now} nested />
          </span>
        </span>
        <div className="col-span-full row-start-2 flex flex-wrap items-center justify-between gap-x-2 md:col-span-4 md:row-start-auto">
          <span className="text-muted-foreground md:pointer-coarse:flex flex min-w-0 items-center gap-1.5 md:group-focus-within/role:hidden md:group-hover/role:hidden">
            <span className="truncate">{where}</span>
            {job.remote && (
              <Badge variant="outline" className="font-normal">
                Remote
              </Badge>
            )}
          </span>
          <span className="md:pointer-coarse:flex flex items-center gap-0.5 md:ms-auto md:hidden md:group-focus-within/role:flex md:group-hover/role:flex">
            {apply}
            {/* On a phone the title needs the room, and Roles has this. */}
            <span className="hidden md:contents">{more}</span>
            {open}
          </span>
        </div>
        <Posted at={job.postedAt} now={now} />
      </div>
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
              stats
                ? `${stats.jobs.toLocaleString("en")} open roles ${stats.summary ? `across ${stats.summary.domains} company domains` : `from ${stats.boards} job boards`}, refreshed daily${signedIn ? " and shared by everyone. Your loops pick from these, and Jev judges which fit you." : "."}`
                : "Open roles from job boards, refreshed daily."
            }
          />

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
                  placeholder="Search roles, skills, teams, companies or places"
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
              {signedIn && (
                <>
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
                      className="w-56"
                      aria-label="Domain"
                      placeholder="Any domain"
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
                  {filtered && (
                    <Button
                      size="sm"
                      variant="ghost"
                      render={<Link to="/jobs" search={{ view, collapsed }} />}
                    >
                      <HugeiconsIcon icon={Cancel01Icon} />
                      Clear filters
                    </Button>
                  )}
                </>
              )}
              <ToggleGroup
                size="sm"
                variant="outline"
                aria-label="View"
                className="ms-auto"
                value={[view ?? "domains"]}
                onValueChange={(v) => v[0] && set({ view: v[0] === "roles" ? "roles" : undefined })}
              >
                <ToggleGroupItem value="domains">Domains</ToggleGroupItem>
                <ToggleGroupItem value="roles">Roles</ToggleGroupItem>
              </ToggleGroup>
            </div>
          </div>

          {stats?.summary && (
            <Overview
              summary={stats.summary}
              signedIn={signedIn}
              proof={proof}
              ending={ending}
              set={set}
            />
          )}

          <Tile
            title={heading}
            className="gap-0 p-1.5"
            actions={
              !view &&
              jobs.results.length > 0 && (
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={() => set({ collapsed: collapsed ? undefined : true })}
                >
                  {collapsed ? "Show roles" : "Collapse all"}
                </Button>
              )
            }
          >
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
                    ? signedIn
                      ? "No roles match these filters. Try fewer words, or clear a filter."
                      : "No roles match. Try fewer words."
                    : "No roles yet. The catalog fills as boards are fetched."}
              </p>
            )}
            {!view && jobs.results.length > 0 && (
              <div
                className={cn(
                  "text-muted-foreground hidden items-center gap-x-3 px-2.5 pt-2 pb-1 text-xs md:grid",
                  laneColumns
                )}
              >
                <span />
                <span>Domain</span>
                <span>Postings</span>
                <span>Registered</span>
                <span>YC</span>
                <span className="text-end">Open</span>
                <span className="text-end">Newest</span>
              </div>
            )}
            {view
              ? groupRoles(jobs.results).map(roleRow)
              : /* ponytail: groups the roles loaded so far, so a domain and "13 openings" can both
                   grow on Show more. A stored newest role per domain would need updating on every
                   feed refresh. */
                groupDomains(jobs.results).map((domain) => (
                  <Domain
                    key={`${domain[0]!.evidence.domain ?? domain[0]!.company}${collapsed}`}
                    jobs={domain}
                    now={now}
                    collapsed={Boolean(collapsed)}
                    canNarrow={signedIn && !board}
                  >
                    {groupRoles(domain).map(nestedRow)}
                  </Domain>
                ))}
            {jobs.status === "CanLoadMore" && (
              <Button
                size="sm"
                variant="ghost"
                className="m-1 self-start"
                onClick={() => {
                  track("job_show_more")
                  jobs.loadMore(25)
                }}
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
