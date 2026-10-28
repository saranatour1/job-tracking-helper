import { api } from "@convex/_generated/api"
import type { Doc, Id } from "@convex/_generated/dataModel"
import {
  blankTemplate,
  creditsPerRun,
  dailySizes,
  type LoopAnswers,
  type LoopQuestion,
  type LoopTemplate,
  loopQuestions,
  loopTemplates,
  maxLoops,
  type Provider,
  providers,
  runTimes,
  scannedPerRun,
  switchAt,
  templateById,
} from "@convex/api/features/loops/catalog"
import { formOf, rowLimits } from "@convex/api/features/preferences/rows"
import { CheckmarkCircle02Icon, PlusSignIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useForm, useStore } from "@tanstack/react-form"
import { Link, useNavigate, useSearch } from "@tanstack/react-router"
import { useMutation, usePaginatedQuery, useQuery } from "convex/react"
import { ConvexError } from "convex/values"
import { startTransition, useActionState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Meter, MeterIndicator, MeterTrack } from "@/components/ui/meter"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsList, TabsPanel, TabsTab } from "@/components/ui/tabs"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { chip, PageIntro, pageBody, Tile, tileGrid } from "@/features/shell/page-body"
import { PageHeader } from "@/features/shell/page-header"
import { cn } from "@/lib/utils"

type Loop = Doc<"loops">
type Run = Doc<"loopRuns">
type Lead = Doc<"jobLeads">
type DailySize = (typeof dailySizes)[number]
type RunTime = (typeof runTimes)[number]

const loopsTabs = ["loops", "runs", "sources"] as const
export type LoopsTab = (typeof loopsTabs)[number]

// Reads `?tab=` and `?template=` for the route, dropping anything it doesn't know.
export const loopsSearch = (
  search: Record<string, unknown>
): { tab?: LoopsTab; template?: string } => ({
  tab: loopsTabs.find((t) => t === search.tab),
  template:
    typeof search.template === "string" && templateById(search.template)
      ? search.template
      : undefined,
})

type Prefs = ReturnType<typeof formOf>

const messageOf = (error: unknown) =>
  error instanceof ConvexError && typeof error.data === "string"
    ? error.data
    : "Something went wrong. Try again."

const list = (items: string[], max = 3) =>
  items.length > max
    ? `${items.slice(0, max).join(", ")} and ${items.length - max} more`
    : items.join(", ")

// What a matching job looks like, in plain lines, from the answers and Preferences.
const lookFor = (a: LoopAnswers, p: Prefs | undefined): string[] => {
  const lines: string[] = []
  if (a.remoteOnly) lines.push("Remote")
  if (a.nearMe)
    lines.push(
      p?.locations.length ? `On-site or hybrid in ${list(p.locations)}` : "On-site or hybrid nearby"
    )
  if (a.listedCompanies)
    lines.push(p?.companies.length ? `At ${list(p.companies)}` : "At the companies you list")
  if (a.usePreferences)
    lines.push(p?.interests.length ? `Working on ${list(p.interests)}` : "Matching your interests")
  if (a.stretch)
    lines.push(
      p?.skillsToBuild.length ? `Uses ${list(p.skillsToBuild)}` : "A step up from where you are"
    )
  if (a.skipRedFlags) {
    const skip = [...(p?.avoid ?? []), ...(p?.redFlagCompanies ?? [])]
    lines.push(skip.length ? `Not ${list(skip)}` : "Skips what you'd avoid")
  }
  if (a.postedToday) lines.push("Posted in the last day")
  return lines.length ? lines : ["Anything new, with no filters"]
}

const day = (ms: number) =>
  new Date(ms).toLocaleDateString("en", { month: "short", day: "numeric" })
const when = (ms: number) =>
  new Date(ms).toLocaleString("en", { weekday: "short", hour: "2-digit", minute: "2-digit" })
const percent = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0)

const Heading = ({ title, description }: { title: string; description?: string }) => (
  <div className="flex flex-col gap-0.5 px-1">
    <h3 className="text-[15px] font-medium">{title}</h3>
    {description && <p className="text-muted-foreground text-xs">{description}</p>}
  </div>
)

// A label and its value, the row every tile on this page uses.
const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-3 px-1 text-[13px]">
    <dt className="text-muted-foreground">{label}</dt>
    <dd>{children}</dd>
  </div>
)

const Checklist = ({ lines }: { lines: string[] }) => (
  <ul className="flex flex-col gap-1 px-1 text-[13px]">
    {lines.map((line) => (
      <li key={line} className="flex items-start gap-2">
        <HugeiconsIcon
          icon={CheckmarkCircle02Icon}
          className="text-muted-foreground mt-0.5 size-3.5 shrink-0"
        />
        {line}
      </li>
    ))}
  </ul>
)

const Status = ({ text }: { text: string | undefined }) =>
  text ? (
    <p role="status" className="text-muted-foreground px-1 text-xs">
      {text}
    </p>
  ) : null

// How many jobs each recent run kept, oldest on the left.
const KeptBars = ({ runs }: { runs: Run[] }) => {
  if (!runs.length) return null
  const most = Math.max(1, ...runs.map((r) => r.kept))
  return (
    <div
      role="img"
      aria-label={`Jobs kept, last ${runs.length} runs: ${runs.map((r) => r.kept).join(", ")}`}
      className="flex h-10 items-end gap-1 px-1"
    >
      {runs.map((r) => (
        <span
          key={r._id}
          title={`${day(r.startedAt)}: ${r.kept} kept`}
          style={{ height: `${Math.max(8, (r.kept / most) * 100)}%` }}
          className={cn(
            "w-3 rounded-sm",
            r.status === "done" ? "bg-primary/70" : "bg-muted-foreground/30"
          )}
        />
      ))}
    </div>
  )
}

const LoopTile = ({ loop, runs, prefs }: { loop: Loop; runs: Run[]; prefs: Prefs | undefined }) => {
  const setActive = useMutation(api.loops.setActive)
  const runNow = useMutation(api.loops.runNow)
  const remove = useMutation(api.loops.remove)
  const [status, act] = useActionState(
    async (_: string | undefined, action: "pause" | "resume" | "run" | "remove") => {
      try {
        if (action === "run") {
          await runNow({ loopId: loop._id })
          return "Started. It shows up under Runs in a minute or two."
        }
        if (action === "remove") {
          if (!window.confirm(`Remove "${loop.name}"? Its runs and jobs stay.`)) return undefined
          await remove({ loopId: loop._id })
          return undefined
        }
        await setActive({ loopId: loop._id, active: action === "resume" })
        return undefined
      } catch (error) {
        return messageOf(error)
      }
    },
    undefined
  )
  const last = runs[0]
  return (
    <Tile
      title={loop.name}
      actions={
        <Badge variant={loop.active ? "success" : "outline"} className="font-normal">
          {loop.active ? "Active" : "Paused"}
        </Badge>
      }
    >
      <dl className="flex flex-col gap-1.5">
        <Row label="Each morning">
          {loop.at} · up to {loop.daily} jobs
        </Row>
        <Row label="Looks for">{lookFor(loop.answers, prefs).join(" · ")}</Row>
        <Row label="Next run">{loop.active ? when(loop.nextRunAt) : "Paused"}</Row>
        <Row label="Last run">
          {last
            ? last.status === "done"
              ? `${day(last.startedAt)}: read ${last.scanned}, kept ${last.kept}`
              : `${day(last.startedAt)}: ${last.status}`
            : "Not run yet"}
        </Row>
      </dl>
      <KeptBars runs={runs.slice(0, 7).reverse()} />
      <div className="flex flex-wrap gap-1.5 px-1">
        <Button size="xs" variant="outline" onClick={() => startTransition(() => act("run"))}>
          Run now
        </Button>
        <Button
          size="xs"
          variant="ghost"
          onClick={() => startTransition(() => act(loop.active ? "pause" : "resume"))}
        >
          {loop.active ? "Pause" : "Resume"}
        </Button>
        <Button
          size="xs"
          variant="ghost"
          className="ms-auto"
          onClick={() => startTransition(() => act("remove"))}
        >
          Remove
        </Button>
      </div>
      <Status text={status} />
    </Tile>
  )
}

// Jobs the runs kept and nobody has acted on yet.
const NewJobs = ({ leads }: { leads: Lead[] }) => {
  const setLeadStatus = useMutation(api.loops.setLeadStatus)
  const [status, act] = useActionState(
    async (
      _: string | undefined,
      { leadId, to }: { leadId: Id<"jobLeads">; to: "saved" | "dismissed" | "applied" }
    ) => {
      try {
        await setLeadStatus({ leadId, status: to })
        return to === "applied" ? "Added to Applications." : undefined
      } catch (error) {
        return messageOf(error)
      }
    },
    undefined
  )
  return (
    <Tile title={`New jobs · ${leads.length}`} className="gap-0 p-1.5">
      {leads.length === 0 && (
        <p className="text-muted-foreground px-2.5 py-2 text-[13px]">
          Nothing new yet. Jobs your loops keep show up here each morning.
        </p>
      )}
      {leads.map((lead) => (
        <div
          key={lead._id}
          className="hover:bg-accent/30 flex flex-col gap-1 rounded-md px-2.5 py-2 text-[13px] sm:flex-row sm:items-start sm:gap-3"
        >
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <a
              href={lead.url}
              target="_blank"
              rel="noreferrer"
              className="truncate font-medium hover:underline"
            >
              {lead.title}
            </a>
            <span className="text-muted-foreground truncate text-xs">
              {lead.company} · fit {lead.fit} · {lead.reasons.join(", ") || "no strong matches"}
            </span>
          </div>
          <div className="flex shrink-0 gap-1">
            {(
              [
                ["saved", "Save"],
                ["applied", "Applied"],
                ["dismissed", "Dismiss"],
              ] as const
            ).map(([to, label]) => (
              <Button
                key={to}
                size="xs"
                variant={to === "dismissed" ? "ghost" : "outline"}
                onClick={() => startTransition(() => act({ leadId: lead._id, to }))}
              >
                {label}
              </Button>
            ))}
          </div>
        </div>
      ))}
      <Status text={status} />
    </Tile>
  )
}

const LoopsOverview = ({
  loops,
  runs,
  leads,
  prefs,
}: {
  loops: Loop[]
  runs: Run[]
  leads: Lead[]
  prefs: Prefs | undefined
}) => (
  <>
    <PageIntro
      title="Loops"
      description="Searches that run each morning and bring back jobs that fit you. Pick a template, answer a few yes-or-no questions, and it runs on its own."
    />
    {loops.length > 0 && (
      <>
        <Heading
          title={`Your loops · ${loops.length} of ${maxLoops}`}
          description="Each one runs once a morning. Pause one to stop it without losing its history."
        />
        <div className={tileGrid}>
          {loops.map((loop) => (
            <LoopTile
              key={loop._id}
              loop={loop}
              runs={runs.filter((r) => r.loopId === loop._id)}
              prefs={prefs}
            />
          ))}
        </div>
        <NewJobs leads={leads} />
      </>
    )}
    <Heading
      title="Start from a template"
      description="Each one is filled in from your Preferences. Open it to change any answer."
    />
    <div className={tileGrid}>
      {[...loopTemplates, blankTemplate].map((t) => (
        <Tile
          key={t.id}
          title={t.name}
          actions={
            <Button
              size="xs"
              variant="outline"
              disabled={loops.length >= maxLoops}
              render={<Link to="/loops" search={{ tab: "loops", template: t.id }} />}
            >
              Use this
            </Button>
          }
        >
          <p className="text-muted-foreground px-1 text-[13px]">{t.pitch}</p>
          <Checklist lines={lookFor(t.answers, prefs)} />
          <p className="text-muted-foreground px-1 text-xs">
            {t.at} each morning · up to {t.daily} jobs · about {creditsPerRun(t.daily)} credits
          </p>
        </Tile>
      ))}
    </div>
  </>
)

// One question: its words on the left, Yes or No on the right.
const YesNo = ({
  question,
  value,
  onChange,
}: {
  question: LoopQuestion
  value: boolean
  onChange: (value: boolean) => void
}) => (
  <div className="hover:bg-accent/30 flex items-center gap-4 rounded-md px-2.5 py-2.5 transition-colors">
    <div className="flex min-w-0 flex-1 flex-col">
      <span id={`${question}-label`} className="text-[13px] font-medium">
        {loopQuestions[question].label}
      </span>
      <span className="text-muted-foreground text-xs">{loopQuestions[question].hint}</span>
    </div>
    <ToggleGroup
      variant="outline"
      size="sm"
      aria-labelledby={`${question}-label`}
      value={[value ? "yes" : "no"]}
      onValueChange={(v) => v[0] && onChange(v[0] === "yes")}
    >
      <ToggleGroupItem value="yes">Yes</ToggleGroupItem>
      <ToggleGroupItem value="no">No</ToggleGroupItem>
    </ToggleGroup>
  </div>
)

// Remote only and on-site near me can't both be yes.
const opposite: Partial<Record<LoopQuestion, LoopQuestion>> = {
  remoteOnly: "nearMe",
  nearMe: "remoteOnly",
}

// Picking from a few fixed answers keeps every loop's cost known before it runs.
const Setup = ({ template, prefs }: { template: LoopTemplate; prefs: Prefs | undefined }) => {
  const create = useMutation(api.loops.create)
  const navigate = useNavigate()
  const form = useForm({
    defaultValues: {
      name: template.name,
      answers: template.answers,
      daily: template.daily as DailySize,
      at: template.at as RunTime,
    },
  })
  const values = useStore(form.store, (s) => s.values)
  const credits = creditsPerRun(values.daily)
  const [status, start] = useActionState(async () => {
    try {
      await create({
        name: values.name,
        template: template.id,
        answers: values.answers,
        daily: values.daily,
        at: values.at,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      })
      await navigate({ to: "/loops", search: { tab: "loops" } })
      return undefined
    } catch (error) {
      return messageOf(error)
    }
  }, undefined)
  return (
    <>
      <PageIntro
        title={template.name}
        description="Answer yes or no. It first runs at the time you pick, and you can pause or remove it any time."
      >
        <Button variant="ghost" size="sm" render={<Link to="/loops" search={{ tab: "loops" }} />}>
          Back to loops
        </Button>
      </PageIntro>
      <div className="grid gap-3 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Tile title="Questions" className="gap-1 p-1.5">
          <form.Field name="name">
            {(f) => (
              <label className="flex items-center gap-4 px-2.5 py-2">
                <span className="flex-1 text-[13px] font-medium">Name</span>
                <Input
                  size="sm"
                  className="max-w-56"
                  value={f.state.value}
                  onChange={(e) => f.handleChange(e.target.value)}
                />
              </label>
            )}
          </form.Field>
          {(Object.keys(loopQuestions) as LoopQuestion[]).map((q) => (
            <form.Field key={q} name={`answers.${q}`}>
              {(f) => (
                <YesNo
                  question={q}
                  value={f.state.value}
                  onChange={(yes) => {
                    f.handleChange(yes)
                    const other = opposite[q]
                    if (yes && other) form.setFieldValue(`answers.${other}`, false)
                  }}
                />
              )}
            </form.Field>
          ))}
        </Tile>
        <div className="flex flex-col gap-3">
          <Tile title="Each morning" className="gap-3">
            <form.Field name="daily">
              {(f) => (
                <Row label="Up to">
                  <ToggleGroup
                    variant="outline"
                    size="sm"
                    aria-label="Jobs each morning"
                    value={[String(f.state.value)]}
                    onValueChange={(v) => v[0] && f.handleChange(Number(v[0]) as DailySize)}
                  >
                    {dailySizes.map((n) => (
                      <ToggleGroupItem key={n} value={String(n)}>
                        {n} jobs
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                </Row>
              )}
            </form.Field>
            <form.Field name="at">
              {(f) => (
                <Row label="Starts at">
                  <ToggleGroup
                    variant="outline"
                    size="sm"
                    aria-label="Start time"
                    value={[f.state.value]}
                    onValueChange={(v) => v[0] && f.handleChange(v[0] as RunTime)}
                  >
                    {runTimes.map((t) => (
                      <ToggleGroupItem key={t} value={t}>
                        {t}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                </Row>
              )}
            </form.Field>
            <dl className="flex flex-col gap-1.5">
              <Row label="Reads about">{scannedPerRun(values.daily)} postings a run</Row>
              <Row label="Costs about">
                {credits} credits a run, {(credits * 30).toLocaleString("en")} a month
              </Row>
              <Row label="Free tier">
                context.dev's 1,000 free credits cover {Math.floor(1000 / credits)} runs
              </Row>
            </dl>
          </Tile>
          <Tile title="A matching job looks like">
            <Checklist lines={lookFor(values.answers, prefs)} />
          </Tile>
        </div>
      </div>
      <div className="flex items-center justify-end gap-3">
        {status && (
          <p role="alert" className="text-destructive text-sm">
            {status}
          </p>
        )}
        <Button type="button" onClick={() => startTransition(() => start())}>
          Start loop
        </Button>
      </div>
    </>
  )
}

const Stat = ({ label, value, note }: { label: string; value: string; note?: string }) => (
  <Tile title={label} className="gap-1">
    <span className="px-1 text-2xl font-semibold tabular-nums">{value}</span>
    {note && <span className="text-muted-foreground px-1 text-xs">{note}</span>}
  </Tile>
)

const statusBadge = {
  queued: "info",
  running: "info",
  done: "success",
  failed: "error",
  skipped: "outline",
} as const

const RunsTab = ({ runs, more }: { runs: Run[]; more?: () => void }) => {
  const sum = (key: "scanned" | "kept" | "saved" | "applied" | "credits", from = runs) =>
    from.reduce((n, r) => n + r[key], 0)
  return (
    <>
      <PageIntro
        title="Runs"
        description="Each morning's run: what it read, what it kept and what came of it."
      />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Runs" value={String(runs.length)} note="Loaded below" />
        <Stat
          label="Kept"
          value={String(sum("kept"))}
          note={`${percent(sum("kept"), sum("scanned"))}% of ${sum("scanned")} read`}
        />
        <Stat
          label="Saved"
          value={String(sum("saved"))}
          note={`${percent(sum("saved"), sum("kept"))}% of kept`}
        />
        <Stat
          label="Applied"
          value={String(sum("applied"))}
          note={`${percent(sum("applied"), sum("saved"))}% of saved`}
        />
      </div>
      <div className={tileGrid}>
        {(Object.keys(providers) as Provider[]).map((p) => {
          const used = runs.filter((r) => r.provider === p)
          return (
            <Tile key={p} title={providers[p].name}>
              <dl className="flex flex-col gap-1.5">
                <Row label="Runs">{used.length}</Row>
                <Row label="Kept">
                  {percent(sum("kept", used), sum("scanned", used))}% of what it read
                </Row>
                <Row label="Per kept job">
                  {sum("kept", used)
                    ? `${(sum("credits", used) / sum("kept", used)).toFixed(1)} credits`
                    : "—"}
                </Row>
              </dl>
            </Tile>
          )
        })}
      </div>
      <Tile title="Every run" className="gap-0 p-1.5">
        {runs.length === 0 && (
          <p className="text-muted-foreground px-2.5 py-2 text-[13px]">
            No runs yet. Loops run each morning, or press Run now on one.
          </p>
        )}
        {runs.length > 0 && (
          <div className="text-muted-foreground hidden grid-cols-[4.5rem_minmax(0,1fr)_6rem_9rem_4.5rem_4.5rem] gap-3 px-2.5 py-1.5 text-xs md:grid">
            <span>Day</span>
            <span>Loop</span>
            <span>Source</span>
            <span>Read → kept → saved</span>
            <span>Credits</span>
            <span>Status</span>
          </div>
        )}
        {runs.map((r) => (
          <div
            key={r._id}
            className="hover:bg-accent/30 grid grid-cols-[4.5rem_minmax(0,1fr)_4.5rem] items-start gap-x-3 gap-y-0.5 rounded-md px-2.5 py-2 text-[13px] md:grid-cols-[4.5rem_minmax(0,1fr)_6rem_9rem_4.5rem_4.5rem]"
          >
            <span className="text-muted-foreground">{day(r.startedAt)}</span>
            <span className="truncate">{r.loopName}</span>
            <span className="text-muted-foreground hidden md:block">
              {r.provider ? providers[r.provider].name : "—"}
            </span>
            <span className="hidden tabular-nums md:block">
              {r.scanned} → {r.kept} → {r.saved}
            </span>
            <span className="hidden tabular-nums md:block">{r.credits}</span>
            <span>
              <Badge variant={statusBadge[r.status]} className="font-normal capitalize">
                {r.status}
              </Badge>
            </span>
            {r.note && (
              <span className="text-muted-foreground col-span-full text-xs md:col-start-2">
                {r.note}
              </span>
            )}
          </div>
        ))}
        {more && (
          <Button size="xs" variant="ghost" className="m-1 self-start" onClick={more}>
            Show older runs
          </Button>
        )}
      </Tile>
    </>
  )
}

// The steps of one run, and the piece that carries each.
const runSteps = [
  ["Wake up", "A cron every 15 minutes starts the loops that are due, a few at a time.", "cron"],
  [
    "Plan the search",
    "Turns the loop's answers and your Preferences into search words.",
    "workflow step",
  ],
  [
    "Search",
    "Asks Firecrawl for recent postings, or context.dev once Firecrawl runs low.",
    "rate limiter",
  ],
  [
    "Read postings",
    "Reads about three postings for each job it keeps, two at a time, in one batch.",
    "batch action",
  ],
  ["Score and keep", "Checks each posting against the loop and skips red flags.", "rules"],
  [
    "Save and log",
    "Saves new jobs, skips ones you've already seen, and logs the run as one event.",
    "evlog",
  ],
] as const

type SourceRow = {
  provider: Provider
  configured: boolean
  used: number
  limit: number
  exhausted: boolean
  usable: boolean
}

const SourcesTab = ({ rows }: { rows: SourceRow[] }) => {
  const inUse = rows.find((r) => r.usable)?.provider
  return (
    <>
      <PageIntro
        title="Sources"
        description={`Where jobs come from. A run uses ${rows.map((r) => providers[r.provider].name).join(", then ")}, moving on once a source has used ${switchAt * 100}% of its monthly credits or says it's out. If every source is out, the run is skipped and says so in Runs.`}
      />
      <div className={tileGrid}>
        {rows.map(({ provider, configured, used, limit, exhausted }) => (
          <Tile
            key={provider}
            title={providers[provider].name}
            actions={
              <Badge variant={provider === inUse ? "info" : "outline"} className="font-normal">
                {!configured
                  ? "Not set up"
                  : provider === inUse
                    ? "In use"
                    : exhausted || used >= limit * switchAt
                      ? "Out for this month"
                      : "Next up"}
              </Badge>
            }
          >
            <Meter
              value={percent(used, limit)}
              aria-label={`${providers[provider].name} credits used`}
              className="px-1"
            >
              <MeterTrack className="h-1.5 rounded-full">
                <MeterIndicator className="rounded-full" />
              </MeterTrack>
            </Meter>
            <dl className="flex flex-col gap-1.5">
              <Row label="This month">
                {used.toLocaleString("en")} of {limit.toLocaleString("en")} credits
              </Row>
              <Row label="Moves on at">
                {Math.round(limit * switchAt).toLocaleString("en")} credits
              </Row>
              {!configured && (
                <Row label="To set up">
                  Add {provider === "firecrawl" ? "FIRECRAWL_API_KEY" : "CONTEXT_DEV_API_KEY"} to
                  the Convex env
                </Row>
              )}
            </dl>
          </Tile>
        ))}
      </div>
      <Tile title="How a run works" className="gap-0 p-1.5">
        <ol>
          {runSteps.map(([title, detail, piece], i) => (
            <li key={title} className="flex items-start gap-3 px-2.5 py-2 text-[13px]">
              <span className="text-muted-foreground w-4 shrink-0 tabular-nums">{i + 1}</span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="font-medium">{title}</span>
                <span className="text-muted-foreground text-xs">{detail}</span>
              </span>
              <span className={cn(chip, "text-muted-foreground shrink-0 font-normal")}>
                {piece}
              </span>
            </li>
          ))}
        </ol>
      </Tile>
      <Tile title="Limits that keep runs cheap">
        <dl className="flex flex-col gap-1.5">
          <Row label="Loops">{maxLoops} per person</Row>
          <Row label="Jobs a morning">{dailySizes.join(", ")}, picked per loop</Row>
          <Row label="Runs">Once a morning per loop, plus 3 by hand a day</Row>
          <Row label="Calls">Each source has a per-minute limit shared by everyone</Row>
          <Row label="Questions">Yes or no only, so every answer has a known cost</Row>
        </dl>
      </Tile>
    </>
  )
}

export const Loops = () => {
  const search = useSearch({ from: "/_app/loops" })
  const navigate = useNavigate()
  const tab = search.tab ?? "loops"
  const template = templateById(search.template)
  const loops = useQuery(api.loops.list) ?? []
  const runs = usePaginatedQuery(api.loops.runs, {}, { initialNumItems: 30 })
  const leads = usePaginatedQuery(api.loops.leads, { status: "new" }, { initialNumItems: 20 })
  const sources = useQuery(api.loops.sourceStatus, {
    month: new Date().toISOString().slice(0, 7),
  })
  // Templates are filled in from the person's Preferences tags.
  const settings = useQuery(api.preferences.get)
  const tags = usePaginatedQuery(api.preferences.tags, {}, { initialNumItems: rowLimits.tags })
  const prefs =
    settings !== undefined && tags.status !== "LoadingFirstPage"
      ? formOf(settings.settings?.workMode ?? "any", tags.results, [])
      : undefined
  return (
    <div className="soft-theme bg-background text-foreground flex h-svh flex-col rounded-[inherit] md:h-[calc(100svh-1rem)]">
      <PageHeader
        crumbs={[{ label: "Loops" }]}
        actions={
          <Button
            variant="ghost"
            size="sm"
            disabled={loops.length >= maxLoops}
            render={<Link to="/loops" search={{ tab: "loops", template: blankTemplate.id }} />}
          >
            <HugeiconsIcon icon={PlusSignIcon} /> New loop
          </Button>
        }
      />
      <Tabs
        value={tab}
        onValueChange={(v) =>
          void navigate({
            from: "/loops",
            to: "/loops",
            search: (prev) => ({ ...prev, tab: v as LoopsTab }),
          })
        }
        className="flex min-h-0 flex-1 flex-col gap-0"
      >
        <div className="border-b px-4 py-1.5">
          <TabsList size="sm">
            <TabsTab value="loops">Loops</TabsTab>
            <TabsTab value="runs">Runs</TabsTab>
            <TabsTab value="sources">Sources</TabsTab>
          </TabsList>
        </div>
        {(
          [
            [
              "loops",
              template ? (
                <Setup key={template.id} template={template} prefs={prefs} />
              ) : (
                <LoopsOverview
                  loops={loops}
                  runs={runs.results}
                  leads={leads.results}
                  prefs={prefs}
                />
              ),
            ],
            [
              "runs",
              <RunsTab
                key="runs"
                runs={runs.results}
                more={runs.status === "CanLoadMore" ? () => runs.loadMore(30) : undefined}
              />,
            ],
            ["sources", <SourcesTab key="sources" rows={sources ?? []} />],
          ] as const
        ).map(([value, content]) => (
          <TabsPanel key={value} value={value} className="flex min-h-0">
            <ScrollArea className="min-h-0 flex-1">
              <div
                className={cn(
                  pageBody,
                  "animate-in fade-in duration-300 motion-reduce:animate-none"
                )}
              >
                {content}
              </div>
            </ScrollArea>
          </TabsPanel>
        ))}
      </Tabs>
    </div>
  )
}
