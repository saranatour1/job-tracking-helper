import { api } from "@/lib/api"
import { PrepareButton } from "@/features/prefilled/prefilled"
import type { Doc, Id } from "@convex/_generated/dataModel"
import {
  Bookmark01Icon,
  Cancel01Icon,
  LinkSquare02Icon,
  StarIcon,
  TaskAdd01Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { Link, useNavigate } from "@tanstack/react-router"
import { useAction, useMutation } from "convex/react"
import { useQuery } from "convex-helpers/react/cache/hooks"
import { startTransition, useActionState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import { bodyOf, Markdown } from "@/components/markdown"

import { IconAction, messageOf, Status } from "./parts"

type Lead = Doc<"jobLeads">
type Check = NonNullable<Lead["checks"]>[number]
type Decision = "save" | "favorite" | "dismiss" | "track"
export type ShortlistView = "today" | "saved"

// The four things a person can do with a job, in the order they read them.
const decisions = [
  ["save", "Save for later", Bookmark01Icon],
  ["favorite", "Favorite: more like this", StarIcon],
  ["dismiss", "Dismiss: nothing like this", Cancel01Icon],
  ["track", "Add to tracker", TaskAdd01Icon],
] as const

const said: Record<Decision, string> = {
  save: "Saved for later.",
  favorite: "Saved. Tomorrow's runs will look for more like it.",
  dismiss: "Dismissed. Tomorrow's runs will look for less like it.",
  track: "Added to Applications as saved.",
}

const useDecide = () => {
  const respond = useMutation(api.loops.respond)
  const track = useMutation(api.loops.track)
  return useActionState(
    async (
      _: string | undefined,
      { leadId, action }: { leadId: Id<"jobLeads">; action: Decision }
    ) => {
      try {
        if (action === "track") await track({ leadId })
        else await respond({ leadId, action })
        return said[action]
      } catch (error) {
        return messageOf(error)
      }
    },
    undefined
  )
}

const results = {
  fits: { title: "Fits what you asked for", mark: "✓", tone: "text-success-foreground" },
  maybe: {
    title: "Could fit: the posting doesn't say",
    mark: "?",
    tone: "text-warning-foreground",
  },
  notFit: { title: "Doesn't fit", mark: "✕", tone: "text-destructive-foreground" },
} as const

// How many checks fit, could fit and don't, in one short line for a row.
const CheckCounts = ({ checks }: { checks: Check[] }) => {
  const count = (result: Check["result"]) => checks.filter((c) => c.result === result).length
  const parts = (
    [
      ["fits", "fit"],
      ["maybe", "unclear"],
      ["notFit", "don't fit"],
    ] as const
  ).filter(([result]) => count(result) > 0)
  return parts.length ? (
    <span className="flex shrink-0 items-center gap-1.5 text-xs">
      {parts.map(([result, word], i) => (
        <span key={result} className="flex items-center gap-1.5">
          {i > 0 && <span className="text-muted-foreground">·</span>}
          <span className={results[result].tone}>
            {count(result)} {word}
          </span>
        </span>
      ))}
    </span>
  ) : null
}

const matchTone = (fit: number) =>
  fit >= 85 ? "text-success-foreground" : fit >= 70 ? "text-foreground" : "text-muted-foreground"

// The breakdown in groups, for the job panel and an application's panel.
export const Breakdown = ({ checks }: { checks: Check[] }) => (
  <div className="flex flex-col gap-3">
    {(Object.keys(results) as Check["result"][]).map((result) => {
      const group = checks.filter((c) => c.result === result)
      return group.length ? (
        <section key={result} className="flex flex-col gap-1">
          <h4 className="text-muted-foreground text-xs">{results[result].title}</h4>
          <ul className="flex flex-col gap-0.5 text-[13px]">
            {group.map((c) => (
              <li key={c.label} className="flex items-start gap-2">
                <span className={cn("w-3 shrink-0", results[result].tone)}>
                  {results[result].mark}
                </span>
                {c.label}
              </li>
            ))}
          </ul>
        </section>
      ) : null
    })}
  </div>
)

const metaOf = (lead: Lead) =>
  [
    lead.company,
    lead.location,
    lead.feedback === "more" && "★ favorite",
    !lead.loopId && "you added this",
    lead.applicationId && "in your tracker",
  ]
    .filter(Boolean)
    .join(" · ")

const tabs = { today: "For you", saved: "Saved" } as const

// What a loop picked for the person this morning, best first, or what they saved: one
// line per job, like Updates. A row opens the job panel; the icons decide without
// opening it.
export const Shortlist = ({ view, open }: { view: ShortlistView; open?: Id<"jobLeads"> }) => {
  const leads = useQuery(api.loops.shortlist, { status: view === "today" ? "new" : "saved" })
  const [status, act] = useDecide()
  const navigate = useNavigate({ from: "/loops" })
  return (
    <section aria-label="Your shortlist" className="bg-card overflow-hidden rounded-xl border">
      <header className="flex items-center gap-1 border-b px-3 py-1.5">
        <h3 className="me-2 text-[13px] font-medium">Your shortlist</h3>
        {(Object.keys(tabs) as ShortlistView[]).map((t) => (
          <Button
            key={t}
            size="xs"
            variant={view === t ? "secondary" : "ghost"}
            aria-pressed={view === t}
            className="rounded-full"
            onClick={() =>
              void navigate({
                search: (prev) => ({ ...prev, list: t === "saved" ? "saved" : undefined }),
              })
            }
          >
            {tabs[t]}
            {t === view && leads?.length ? (
              <Badge variant="secondary" size="sm">
                {leads.length}
              </Badge>
            ) : null}
          </Button>
        ))}
        <Status text={status} />
      </header>
      {leads?.length === 0 && (
        <p className="text-muted-foreground p-6 text-center text-[13px]">
          {view === "today"
            ? "Nothing waiting. Your loops add jobs that fit each morning, a few at a time."
            : "Nothing kept yet. Save, favorite or track a job to keep it here."}
        </p>
      )}
      <ul>
        {leads?.map((lead) => (
          <li key={lead._id} className="group relative border-b last:border-b-0">
            <Link
              from="/loops"
              to="/loops"
              search={(prev) => ({ ...prev, job: lead._id })}
              aria-current={open === lead._id || undefined}
              className="hover:bg-accent/50 aria-[current=true]:bg-accent flex items-center gap-3 px-3 py-2 transition-colors duration-150"
            >
              <span
                className={cn("w-9 shrink-0 text-xs font-medium tabular-nums", matchTone(lead.fit))}
              >
                {lead.fit}%
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[13px] font-medium">{lead.title}</span>
                <span className="text-muted-foreground truncate text-xs">{metaOf(lead)}</span>
              </span>
              <span className="hidden group-focus-within:invisible group-hover:invisible sm:flex">
                <CheckCounts checks={lead.checks ?? []} />
              </span>
            </Link>
            <div className="absolute end-2 top-1/2 flex -translate-y-1/2 items-center opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
              {decisions
                .filter(([action]) => !(action === "track" && lead.applicationId))
                .filter(([action]) => !(view === "saved" && action === "save"))
                .map(([action, label, icon]) => (
                  <IconAction
                    key={action}
                    label={label}
                    icon={icon}
                    onClick={() => startTransition(() => act({ leadId: lead._id, action }))}
                  />
                ))}
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

// One job in full, in the page's side panel: why it's here, what fits and what doesn't,
// the posting itself, and the four decisions. Opened from `?job=`.
export const JobPanel = ({ leadId, onClose }: { leadId: Id<"jobLeads">; onClose: () => void }) => {
  const data = useQuery(api.loops.lead, { leadId })
  const [status, act] = useDecide()
  const lead = data?.lead
  const prepared = useQuery(api.prefilled.list)?.find((r) => r.url === lead?.url)
  return (
    <div className="flex h-full flex-col">
      <header className="flex h-10 shrink-0 items-center gap-1 border-b px-3">
        <span className="text-muted-foreground truncate text-xs">
          {data ? (data.loopName ? `Found by ${data.loopName}` : "You added this") : ""}
        </span>
        {lead && (
          <Button
            variant="ghost"
            size="xs"
            className="ms-auto"
            render={<a href={lead.url} target="_blank" rel="noreferrer" />}
          >
            <HugeiconsIcon icon={LinkSquare02Icon} /> Posting
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Close panel"
          className={lead ? "" : "ms-auto"}
          onClick={onClose}
        >
          <HugeiconsIcon icon={Cancel01Icon} />
        </Button>
      </header>
      {data === null && (
        <p className="text-muted-foreground p-5 text-sm">That job isn't here anymore.</p>
      )}
      {lead && (
        <>
          <ScrollArea className="min-h-0 flex-1">
            <div className="flex flex-col gap-5 p-5">
              <div className="flex flex-col gap-1">
                <h2 className="font-heading text-xl font-semibold">{lead.title}</h2>
                <p className="text-muted-foreground text-sm">
                  {[lead.company, lead.location].filter(Boolean).join(" · ")}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  variant={lead.verdict === "notFit" ? "outline" : "success"}
                  className="font-normal"
                >
                  {lead.fit}% · {lead.verdict === "notFit" ? "Not a fit" : "A fit for you"}
                </Badge>
                {lead.feedback === "more" && (
                  <Badge variant="warning" className="font-normal">
                    ★ Favorite
                  </Badge>
                )}
                {lead.applicationId && (
                  <Badge variant="info" className="font-normal">
                    In your tracker
                  </Badge>
                )}
              </div>
              <p className="text-[13px] leading-relaxed">{lead.reasons.join(" ")}</p>
              {lead.checks?.length ? (
                <Breakdown checks={lead.checks} />
              ) : (
                <p className="text-muted-foreground text-xs">
                  Judged before the breakdown existed, so there's no line-by-line check.
                </p>
              )}
              <section className="flex flex-col gap-1 border-t pt-5">
                <h4 className="text-muted-foreground text-xs">The posting</h4>
                <Markdown>{bodyOf(data.text)}</Markdown>
              </section>
            </div>
          </ScrollArea>
          <footer className="flex flex-wrap items-center gap-2 border-t p-3">
            <PrepareButton leadId={lead._id} status={prepared?.status} prefillId={prepared?._id} />
            {decisions
              .filter(([action]) => !(action === "track" && lead.applicationId))
              .map(([action, label, icon]) => (
                <Button
                  key={action}
                  size="sm"
                  variant={action === "track" ? "default" : "outline"}
                  onClick={() => startTransition(() => act({ leadId: lead._id, action }))}
                >
                  <HugeiconsIcon icon={icon} />
                  {label.split(":")[0]}
                </Button>
              ))}
            <Status text={status} />
          </footer>
        </>
      )}
    </div>
  )
}

// A job someone found themselves: Jev checks it against their Preferences and it opens
// with the same breakdown, ready to add to the tracker.
export const PasteLink = () => {
  const checkLink = useAction(api.loops.checkLink)
  const navigate = useNavigate({ from: "/loops" })
  const [status, check, checking] = useActionState(
    async (_: string | undefined, form: FormData) => {
      const url = form.get("url")
      if (typeof url !== "string" || !url.trim()) return "Paste a link first."
      try {
        const job = await checkLink({ url })
        await navigate({ search: (prev) => ({ ...prev, job }) })
        return undefined
      } catch (error) {
        return messageOf(error)
      }
    },
    undefined
  )
  return (
    <form action={check} className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2 px-1">
        <Input
          name="url"
          type="url"
          size="sm"
          aria-label="A job's link"
          placeholder="Found one yourself? Paste its link and Jev checks it for you"
          className="max-w-lg flex-1"
        />
        <Button type="submit" size="sm" variant="outline" disabled={checking}>
          {checking ? "Checking…" : "Check it"}
        </Button>
      </div>
      <Status text={status} />
    </form>
  )
}
