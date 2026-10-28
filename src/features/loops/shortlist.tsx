import { api } from "@convex/_generated/api"
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
import { useAction, useMutation, useQuery } from "convex/react"
import { startTransition, useActionState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Sheet,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetPanel,
  SheetPopup,
  SheetTitle,
} from "@/components/ui/sheet"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Tile } from "@/features/shell/page-body"
import { cn } from "@/lib/utils"

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

// The breakdown in one line, for a row on the shortlist.
const CheckLine = ({ checks }: { checks: Check[] }) =>
  checks.length ? (
    <span className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
      {checks.map((c) => (
        <span key={c.label} className={results[c.result].tone}>
          {results[c.result].mark} {c.label}
        </span>
      ))}
    </span>
  ) : null

// The breakdown in groups, for the job sheet.
const Breakdown = ({ checks }: { checks: Check[] }) => (
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

// What a loop picked for the person this morning, best first, or what they saved.
// Each row opens the job sheet; the icons decide without opening it.
export const Shortlist = ({ view }: { view: ShortlistView }) => {
  const leads = useQuery(api.loops.shortlist, { status: view === "today" ? "new" : "saved" })
  const [status, act] = useDecide()
  const navigate = useNavigate({ from: "/loops" })
  return (
    <Tile
      title="Your shortlist"
      className="gap-1 p-1.5"
      actions={
        <ToggleGroup
          variant="outline"
          size="sm"
          aria-label="Which jobs"
          value={[view]}
          onValueChange={(v) =>
            v[0] &&
            void navigate({
              search: (prev) => ({ ...prev, list: v[0] === "saved" ? "saved" : undefined }),
            })
          }
        >
          <ToggleGroupItem value="today">For you</ToggleGroupItem>
          <ToggleGroupItem value="saved">Saved</ToggleGroupItem>
        </ToggleGroup>
      }
    >
      {leads?.length === 0 && (
        <p className="text-muted-foreground px-2.5 py-2 text-[13px]">
          {view === "today"
            ? "Nothing waiting. Your loops add jobs that fit each morning, a few at a time."
            : "Nothing kept yet. Save, favorite or track a job to keep it here."}
        </p>
      )}
      {leads?.map((lead) => (
        <div
          key={lead._id}
          className="hover:bg-accent/30 grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 rounded-md px-2.5 py-2 text-[13px]"
        >
          <Link
            from="/loops"
            to="/loops"
            search={(prev) => ({ ...prev, job: lead._id })}
            className="flex min-w-0 flex-col gap-1"
          >
            <span className="truncate font-medium">{lead.title}</span>
            <span className="text-muted-foreground truncate text-xs">
              {[lead.company, lead.location, `${lead.fit}% match`].filter(Boolean).join(" · ")}
              {lead.feedback === "more" && " · ★ favorite"}
              {!lead.loopId && " · you added this"}
              {lead.applicationId && " · in your tracker"}
            </span>
            <CheckLine checks={lead.checks ?? []} />
          </Link>
          <div className="flex items-center">
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
        </div>
      ))}
      <Status text={status} />
    </Tile>
  )
}

// One job in full: why it's here, what fits and what doesn't, the posting itself, and
// the four decisions. Opened from `?job=`.
export const JobSheet = ({
  leadId,
  onClose,
}: {
  leadId: Id<"jobLeads"> | undefined
  onClose: () => void
}) => {
  const data = useQuery(api.loops.lead, leadId ? { leadId } : "skip")
  const [status, act] = useDecide()
  const lead = data?.lead
  return (
    <Sheet open={Boolean(leadId)} onOpenChange={(open) => !open && onClose()}>
      <SheetPopup className="max-w-xl">
        {lead && (
          <>
            <SheetHeader>
              <SheetTitle className="pe-8 text-lg leading-snug">{lead.title}</SheetTitle>
              <SheetDescription>
                {[lead.company, lead.location, `${lead.fit}% match`].filter(Boolean).join(" · ")}
                {data.loopName ? ` · found by ${data.loopName}` : " · you added this"}
              </SheetDescription>
            </SheetHeader>
            <SheetPanel className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  variant={lead.verdict === "notFit" ? "outline" : "success"}
                  className="font-normal"
                >
                  {lead.verdict === "notFit" ? "Not a fit" : "A fit for you"}
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
              <p className="text-[13px]">{lead.reasons.join(" ")}</p>
              {lead.checks?.length ? (
                <Breakdown checks={lead.checks} />
              ) : (
                <p className="text-muted-foreground text-xs">
                  Judged before the breakdown existed, so there's no line-by-line check.
                </p>
              )}
              <section className="flex flex-col gap-1">
                <h4 className="text-muted-foreground text-xs">The posting</h4>
                <p className="text-[13px] leading-relaxed whitespace-pre-line">{data.text}</p>
              </section>
            </SheetPanel>
            <SheetFooter className="flex-wrap justify-start gap-2">
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
              <Button
                size="sm"
                variant="ghost"
                render={<a href={lead.url} target="_blank" rel="noreferrer" />}
              >
                <HugeiconsIcon icon={LinkSquare02Icon} />
                Open posting
              </Button>
              <Status text={status} />
            </SheetFooter>
          </>
        )}
        {data === null && (
          <SheetPanel>
            <p className="text-muted-foreground text-sm">That job isn't here anymore.</p>
          </SheetPanel>
        )}
      </SheetPopup>
    </Sheet>
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
