import { api } from "@convex/_generated/api"
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
import { usePaginatedQuery, useQuery } from "convex/react"
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

import { providerUsage, type Run, sampleLoops, sampleRuns } from "./data"

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

const day = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString("en", { month: "short", day: "numeric" })
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

// How many jobs each recent run kept, oldest on the left.
const KeptBars = ({ runs }: { runs: Run[] }) => {
  const most = Math.max(1, ...runs.map((r) => r.kept))
  return (
    <div
      role="img"
      aria-label={`Jobs kept, last ${runs.length} runs: ${runs.map((r) => r.kept).join(", ")}`}
      className="flex h-10 items-end gap-1 px-1"
    >
      {runs.map((r) => (
        <span
          key={r.id}
          title={`${day(r.day)}: ${r.kept} kept`}
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

const LoopsOverview = ({ prefs }: { prefs: Prefs | undefined }) => (
  <>
    <PageIntro
      title="Loops"
      description="Searches that run each morning and bring back jobs that fit you. Pick a template, answer a few yes-or-no questions, and it runs on its own."
    />
    <Heading
      title={`Your loops · ${sampleLoops.length} of ${maxLoops}`}
      description="Each one runs once a morning. Pause one to stop it without losing its history."
    />
    <div className={tileGrid}>
      {sampleLoops.map((loop) => {
        const runs = sampleRuns.filter((r) => r.loopId === loop.id)
        const last = runs[0]
        return (
          <Tile
            key={loop.id}
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
              <Row label="Looks for">
                {lookFor(templateById(loop.template)!.answers, prefs).join(" · ")}
              </Row>
              <Row label="Last run">
                {last ? `${day(last.day)}: read ${last.scanned}, kept ${last.kept}` : "Not run yet"}
              </Row>
            </dl>
            <KeptBars runs={runs.slice(0, 7).reverse()} />
          </Tile>
        )
      })}
    </div>
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
              disabled={sampleLoops.length >= maxLoops}
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
  const form = useForm({
    defaultValues: {
      name: template.name,
      answers: template.answers,
      daily: template.daily as number,
      at: template.at as string,
    },
  })
  const values = useStore(form.store, (s) => s.values)
  const credits = creditsPerRun(values.daily)
  const [status, start] = useActionState(
    async () =>
      `Preview only: "${values.name.trim() || template.name}" will start saving once the loops tables are in.`,
    undefined
  )
  return (
    <>
      <PageIntro
        title={template.name}
        description="Answer yes or no. You can change any answer later, and nothing runs until you start it."
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
                    onValueChange={(v) => v[0] && f.handleChange(Number(v[0]))}
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
                    onValueChange={(v) => v[0] && f.handleChange(v[0])}
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
          <p role="status" className="text-muted-foreground text-sm">
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

const statusBadge = { done: "success", failed: "error", skipped: "outline" } as const

const RunsTab = () => {
  const sum = (key: "scanned" | "kept" | "saved" | "applied" | "credits", runs = sampleRuns) =>
    runs.reduce((n, r) => n + r[key], 0)
  const names = Object.fromEntries(sampleLoops.map((l) => [l.id, l.name]))
  return (
    <>
      <PageIntro
        title="Runs"
        description="Each morning's run: what it read, what it kept and what came of it."
      />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Runs" value={String(sampleRuns.length)} note="Last 7 days" />
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
          const runs = sampleRuns.filter((r) => r.provider === p)
          return (
            <Tile key={p} title={providers[p].name}>
              <dl className="flex flex-col gap-1.5">
                <Row label="Runs">{runs.length}</Row>
                <Row label="Kept">
                  {percent(sum("kept", runs), sum("scanned", runs))}% of what it read
                </Row>
                <Row label="Per kept job">
                  {sum("kept", runs)
                    ? `${(sum("credits", runs) / sum("kept", runs)).toFixed(1)} credits`
                    : "—"}
                </Row>
              </dl>
            </Tile>
          )
        })}
      </div>
      <Tile title="Every run" className="gap-0 p-1.5">
        <div className="text-muted-foreground hidden grid-cols-[4.5rem_minmax(0,1fr)_6rem_9rem_4.5rem_4.5rem] gap-3 px-2.5 py-1.5 text-xs md:grid">
          <span>Day</span>
          <span>Loop</span>
          <span>Source</span>
          <span>Read → kept → saved</span>
          <span>Credits</span>
          <span>Status</span>
        </div>
        {sampleRuns.map((r) => (
          <div
            key={r.id}
            className="hover:bg-accent/30 grid grid-cols-[4.5rem_minmax(0,1fr)_4.5rem] items-start gap-x-3 gap-y-0.5 rounded-md px-2.5 py-2 text-[13px] md:grid-cols-[4.5rem_minmax(0,1fr)_6rem_9rem_4.5rem_4.5rem]"
          >
            <span className="text-muted-foreground">{day(r.day)}</span>
            <span className="truncate">{names[r.loopId]}</span>
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
      </Tile>
    </>
  )
}

// The steps of one run, and the Convex piece that carries each.
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
    "Reads about three postings for each job it keeps, several at once.",
    "workpool",
  ],
  ["Score and keep", "Checks each posting against the loop and skips red flags.", "workflow step"],
  [
    "Save and tell you",
    "Saves new jobs, skips ones you've already seen, and posts a summary to Inbox.",
    "workflow onComplete",
  ],
] as const

const SourcesTab = () => {
  const order = Object.keys(providers) as Provider[]
  const inUse = order.find((p) => providerUsage[p].used < providerUsage[p].limit * switchAt)
  return (
    <>
      <PageIntro
        title="Sources"
        description={`Where jobs come from. A run uses ${order.map((p) => providers[p].name).join(", then ")}, moving on once a source has used ${switchAt * 100}% of its monthly credits. If every source is low, the run waits and says so in Runs.`}
      />
      <div className={tileGrid}>
        {order.map((p) => {
          const { used, limit, resets } = providerUsage[p]
          return (
            <Tile
              key={p}
              title={providers[p].name}
              actions={
                <Badge variant={p === inUse ? "info" : "outline"} className="font-normal">
                  {p === inUse ? "In use" : used >= limit * switchAt ? "Low" : "Next up"}
                </Badge>
              }
            >
              <Meter
                value={percent(used, limit)}
                aria-label={`${providers[p].name} credits used`}
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
                <Row label="Resets">{resets}</Row>
              </dl>
            </Tile>
          )
        })}
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
          <Row label="Runs">Once a day per loop, at {runTimes.join(", ")}</Row>
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
            disabled={sampleLoops.length >= maxLoops}
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
                <LoopsOverview prefs={prefs} />
              ),
            ],
            ["runs", <RunsTab key="runs" />],
            ["sources", <SourcesTab key="sources" />],
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
