import { useGoalRoutes } from "@/lib/route-ids"
import { api } from "@/lib/api"
import type { Id } from "@convex/_generated/dataModel"
import {
  ArrowMoveUpRightIcon,
  Calendar03Icon,
  CircleIcon,
  Note01Icon,
  PlusSignIcon,
  Target02Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { Link, useNavigate } from "@tanstack/react-router"
import { useAction, useMutation } from "convex/react"
import { useQuery } from "convex-helpers/react/cache/hooks"
import { ConvexError } from "convex/values"
import { startTransition, useActionState, useRef } from "react"

import { DatePicker } from "@/components/date-picker"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogCreateHandle,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Meter, MeterIndicator, MeterTrack } from "@/components/ui/meter"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Textarea } from "@/components/ui/textarea"
import { messageOf, Section } from "@/features/account/settings"
import { PageIntro, pageBody } from "@/features/shell/page-body"
import { PageHeader } from "@/features/shell/page-header"
import { cn } from "@/lib/utils"

import {
  type ApplicationCard,
  type Goal,
  type Priority,
  formatDate,
  goalProgress,
  goalStatus,
  milestoneLine,
  parseMilestones,
  priorities,
  priorityLabels,
  statusLabels,
} from "./data"
import { PriorityIcon } from "./icons"
import { MailLine } from "./mail"
import { Pipeline } from "./pipeline"
import { useSource } from "./source"
import { StreakCard } from "./streak-card"
import { useSavedEvents } from "@/features/calendar/saved"

// Today as YYYY-MM-DD, the form a goal's dates take.
const todayIso = () => new Date().toISOString().slice(0, 10)

const statusBadge = {
  Active: "info",
  Upcoming: "outline",
  Completed: "success",
  Missed: "warning",
} as const

/** The person's loops, for a goal to take roles from. */
const useLoops = () => useQuery(api.loops.list) ?? []

const GoalBadge = ({ goal, on }: { goal: Goal; on: string }) => {
  const status = goalStatus(goal, on)
  return (
    <Badge variant={statusBadge[status]} className="font-normal">
      {status}
    </Badge>
  )
}

const GoalMeter = ({ goal, on, className }: { goal: Goal; on: string; className?: string }) => (
  <Meter value={goalProgress(goal, on)} aria-label={`${goal.name} progress`} className={className}>
    <MeterTrack className="h-1.5 rounded-full">
      <MeterIndicator className="rounded-full" />
    </MeterTrack>
  </Meter>
)

const stats = (goal: Goal, applications: ApplicationCard[]) => {
  const items = applications.filter((a) => a.goalId === goal.id)
  const reached = (s: string) => items.filter((a) => a.history.some((e) => e.status === s)).length
  return { items: items.length, interviews: reached("interviewing"), offers: reached("offer") }
}

const select = "border-input h-9 w-full rounded-lg border bg-transparent px-2.5 text-sm sm:h-8"

// Creates a goal, or edits the one given. Milestones are one per line, with a date at the
// end if it has one; a renamed milestone starts unticked.
const GoalDialog = ({ goal, trigger }: { goal?: Goal; trigger: React.ReactElement }) => {
  const create = useMutation(api.goals.create)
  const update = useMutation(api.goals.update)
  const loops = useLoops()
  const handle = useRef(DialogCreateHandle()).current
  const [error, submit] = useActionState(async (_: string | undefined, form: FormData) => {
    const text = (name: string) => {
      const value = form.get(name)
      return typeof value === "string" ? value.trim() : ""
    }
    const fields = {
      name: text("name"),
      summary: text("summary"),
      priority: text("priority") as Priority,
      start: text("start"),
      target: text("target"),
      milestones: parseMilestones(text("milestones"), goal?.milestones),
      // null clears the loop.
      loopId: (text("loop") || null) as Id<"loops"> | null,
    }
    if (!fields.name) return "Give the goal a name."
    if (!fields.start || !fields.target) return "Pick a start and a target date."
    try {
      if (goal) await update({ id: goal.id as Id<"goals">, ...fields })
      else await create(fields)
      handle.close()
      return undefined
    } catch (cause) {
      return cause instanceof ConvexError ? String(cause.data) : "Something went wrong. Try again."
    }
  }, undefined)

  return (
    <Dialog handle={handle}>
      <DialogTrigger render={trigger} />
      <DialogPopup className="sm:max-w-lg">
        <form action={submit} className="contents">
          <DialogHeader>
            <DialogTitle>{goal ? "Edit goal" : "New goal"}</DialogTitle>
            <DialogDescription>
              {goal ? "Change what this goal is about." : "Something your search is for."}
            </DialogDescription>
          </DialogHeader>
          <DialogPanel className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="goal-name">Name</Label>
              <Input
                id="goal-name"
                name="name"
                defaultValue={goal?.name}
                placeholder="Land a frontend role"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="goal-summary">Summary</Label>
              <Input
                id="goal-summary"
                name="summary"
                defaultValue={goal?.summary}
                placeholder="A full-time frontend role before the end of Q1"
              />
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div className="grid gap-1.5">
                <Label htmlFor="goal-start">Start</Label>
                <DatePicker id="goal-start" name="start" defaultValue={goal?.start ?? todayIso()} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="goal-target">Target</Label>
                <DatePicker id="goal-target" name="target" defaultValue={goal?.target} />
              </div>
              <div className="col-span-2 grid gap-1.5 sm:col-span-1">
                <Label htmlFor="goal-priority">Priority</Label>
                <select
                  id="goal-priority"
                  name="priority"
                  defaultValue={goal?.priority ?? "medium"}
                  className={select}
                >
                  {priorities.map((p) => (
                    <option key={p} value={p}>
                      {priorityLabels[p]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="goal-loop">Loop</Label>
              <select
                id="goal-loop"
                name="loop"
                defaultValue={goal?.loopId ?? ""}
                className={select}
              >
                <option value="">No loop</option>
                {loops.map((loop) => (
                  <option key={loop._id} value={loop._id}>
                    {loop.name}
                  </option>
                ))}
              </select>
              <p className="text-muted-foreground text-xs">
                Roles you add to the board from this loop's shortlist join the goal.
              </p>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="goal-milestones">Milestones</Label>
              <Textarea
                id="goal-milestones"
                name="milestones"
                defaultValue={goal?.milestones.map(milestoneLine).join("\n")}
                placeholder={
                  "One per line, with a date at the end if it has one, like:\nApply to 30 companies 2026-11-30\nReach 5 interviews"
                }
                className="min-h-24"
              />
            </div>
            {error && (
              <p role="alert" className="text-destructive text-sm">
                {error}
              </p>
            )}
          </DialogPanel>
          <DialogFooter>
            <DialogClose render={<Button variant="ghost" />}>Cancel</DialogClose>
            <Button type="submit">{goal ? "Save" : "Create goal"}</Button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  )
}

// One goal on the list, laid out like a workflow's row: the name opens it, and what it's
// at sits on the right.
const GoalRow = ({ goal, on }: { goal: Goal; on: string }) => {
  const { applications } = useSource()
  const remove = useMutation(api.goals.remove)
  const retry = useMutation(api.goals.retry)
  const { items } = stats(goal, applications)
  const routes = useGoalRoutes()
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3">
      <Link
        to="/goals/$id"
        params={{ id: routes.text(goal.id) }}
        className="grid min-w-48 flex-1 gap-0.5 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="text-sm font-medium hover:underline">{goal.name}</span>
        <span className="text-muted-foreground text-xs">
          {formatDate(goal.start)} → {formatDate(goal.target)} ·{" "}
          {goal.milestones.filter((m) => m.done).length}/{goal.milestones.length} milestones ·{" "}
          {items} {items === 1 ? "application" : "applications"}
        </span>
      </Link>
      <div className="flex items-center gap-3">
        <GoalBadge goal={goal} on={on} />
        <span className="flex items-center gap-2">
          <GoalMeter goal={goal} on={on} className="w-20" />
          <span className="w-8 text-xs tabular-nums">{goalProgress(goal, on)}%</span>
        </span>
        {goalStatus(goal, on) === "Missed" && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => void retry({ id: goal.id as Id<"goals"> })}
          >
            Retry
          </Button>
        )}
        <GoalDialog
          goal={goal}
          trigger={
            <Button size="sm" variant="ghost">
              Edit
            </Button>
          }
        />
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            if (window.confirm(`Delete “${goal.name}”? Its applications stay.`))
              void remove({ id: goal.id as Id<"goals"> })
          }}
        >
          Delete
        </Button>
      </div>
    </div>
  )
}

// Your goals, newest first, with the done and missed ones below. Laid out like the
// Workflows page.
export const Goals = () => {
  const { goals, loaded } = useSource()
  const on = todayIso()
  const sorted = [...goals].sort((a, b) => b.start.localeCompare(a.start))
  const isPast = (g: Goal) => ["Completed", "Missed"].includes(goalStatus(g, on))
  const open = sorted.filter((g) => !isPast(g))
  const done = sorted.filter(isPast)
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader
        crumbs={[{ label: "Tracker" }, { label: "Goals" }]}
        actions={
          <GoalDialog
            trigger={
              <Button size="sm">
                <HugeiconsIcon icon={PlusSignIcon} /> New goal
              </Button>
            }
          />
        }
      />
      <ScrollArea className="min-h-0 flex-1">
        <main className={cn(pageBody, "max-w-3xl gap-8")}>
          <PageIntro
            title="Goals"
            description="What your search is for. Give a goal milestones to tick and put applications on it from their Goal property; the board can then filter, group and count by goal."
          />
          <StreakCard />
          {loaded && (
            <Section title="Yours">
              {open.length === 0 ? (
                <p className="text-muted-foreground px-4 py-3 text-sm">
                  No goals yet. Start one with New goal.
                </p>
              ) : (
                open.map((goal) => <GoalRow key={goal.id} goal={goal} on={on} />)
              )}
            </Section>
          )}
          {done.length > 0 && (
            <Section title="Past">
              {done.map((goal) => (
                <GoalRow key={goal.id} goal={goal} on={on} />
              ))}
            </Section>
          )}
        </main>
      </ScrollArea>
    </div>
  )
}

// The goal's side panel: dates, progress, milestones to tick, and how its applications
// are doing.
const GoalSummary = ({ goal }: { goal: Goal }) => {
  const source = useSource()
  const { applications } = source
  const update = useMutation(api.goals.update)
  const remove = useMutation(api.goals.remove)
  const evaluate = useAction(api.goalActions.evaluate)
  const loops = useLoops()
  const navigate = useNavigate()
  const on = todayIso()
  const { items, interviews, offers } = stats(goal, applications)
  const id = goal.id as Id<"goals">
  const tick = (name: string) =>
    update({
      id,
      milestones: goal.milestones.map((m) => (m.name === name ? { ...m, done: !m.done } : m)),
    })
  // Jev's verdicts, kept until the next re-evaluation. Each one stays listed only while
  // it still applies, so acting on it takes it off.
  const [verdict, reevaluate, judging] = useActionState(
    () =>
      evaluate({ id }).then(
        (v) => v,
        (cause) => ({ error: messageOf(cause) })
      ),
    undefined
  )
  const named = (ids: string[]) =>
    ids.map((a) => applications.find((x) => x.id === a)).filter((a) => a !== undefined)
  const toAdd = verdict && "add" in verdict ? named(verdict.add).filter((a) => a.goalId !== id) : []
  const toRemove =
    verdict && "remove" in verdict ? named(verdict.remove).filter((a) => a.goalId === id) : []
  return (
    <div className="flex flex-col gap-4 border-b pb-4">
      <div className="text-muted-foreground flex items-center gap-2 text-xs">
        <GoalBadge goal={goal} on={on} />
        <span>
          {formatDate(goal.start)} → {formatDate(goal.target)}
        </span>
        <span className="ms-auto flex gap-1">
          <Button
            variant="ghost"
            size="xs"
            disabled={judging}
            onClick={() => startTransition(reevaluate)}
          >
            {judging ? "Asking Jev…" : "Re-evaluate"}
          </Button>
          <GoalDialog
            goal={goal}
            trigger={
              <Button variant="ghost" size="xs">
                Edit
              </Button>
            }
          />
          <Button
            variant="ghost"
            size="xs"
            className="text-destructive"
            onClick={() => {
              if (!window.confirm(`Delete “${goal.name}”? Its applications stay.`)) return
              void remove({ id }).then(() => navigate({ to: "/goals" }))
            }}
          >
            Delete
          </Button>
        </span>
      </div>
      <div className="flex flex-col gap-1">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold">
          <HugeiconsIcon icon={Target02Icon} className="text-muted-foreground size-4" />
          {goal.name}
        </h2>
        {goal.summary && <p className="text-muted-foreground text-[13px]">{goal.summary}</p>}
        {goal.loopId && (
          <p className="text-muted-foreground text-xs">
            Roles from {loops.find((l) => l._id === goal.loopId)?.name ?? "a loop"} join this goal.
          </p>
        )}
      </div>
      <GoalMeter goal={goal} on={on} />
      {verdict && (
        <div className="flex flex-col gap-2 rounded-lg border p-3 text-[13px]" role="status">
          {"error" in verdict ? (
            <p className="text-destructive">{verdict.error}</p>
          ) : (
            <>
              <p className="text-muted-foreground text-xs">
                Jev looked at {verdict.judged}{" "}
                {verdict.judged === 1 ? "application" : "applications"}
                {toAdd.length + toRemove.length === 0 && ", and agrees with what's on this goal"}.
              </p>
              {toAdd.map((a) => (
                <span key={a.id} className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate">
                    {a.role} at {a.company}
                  </span>
                  <Button size="xs" variant="outline" onClick={() => source.setGoal(a.id, id)}>
                    Add
                  </Button>
                </span>
              ))}
              {toRemove.map((a) => (
                <span key={a.id} className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate">
                    {a.role} at {a.company}
                  </span>
                  <Button
                    size="xs"
                    variant="outline"
                    onClick={() => source.setGoal(a.id, undefined)}
                  >
                    Take off
                  </Button>
                </span>
              ))}
            </>
          )}
        </div>
      )}
      <dl className="grid grid-cols-3 gap-2 text-xs">
        {(
          [
            ["Progress", `${goalProgress(goal, on)}%`],
            ["Interviews", `${interviews}/${items}`],
            ["Offers", `${offers}`],
          ] as const
        ).map(([label, value]) => (
          <div key={label} className="flex flex-col gap-0.5">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="text-[13px] font-medium tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="flex flex-col gap-1">
        <span className="text-muted-foreground text-xs">
          Milestones · <PriorityIcon priority={goal.priority} className="inline size-3" />{" "}
          {priorityLabels[goal.priority]}
        </span>
        {goal.milestones.length === 0 && (
          <p className="text-muted-foreground text-[13px]">None. Edit the goal to add some.</p>
        )}
        <ol className="flex flex-col">
          {goal.milestones.map((m) => (
            <li key={m.name}>
              <button
                type="button"
                aria-pressed={m.done}
                onClick={() => void tick(m.name)}
                className="hover:bg-accent flex w-full items-center gap-2 rounded-md px-1 py-1 text-start text-[13px]"
              >
                <span
                  className={cn(
                    "size-2 shrink-0 rounded-full border",
                    m.done ? "bg-primary border-primary" : "border-muted-foreground"
                  )}
                />
                <span className={m.done ? "text-muted-foreground line-through" : ""}>{m.name}</span>
                {m.target && (
                  <span className="text-muted-foreground ms-auto text-xs">
                    {formatDate(m.target)}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ol>
      </div>
      <GoalActivity goal={goal} />
    </div>
  )
}

// What happened on the goal's applications in its period, newest first: mail, status
// changes, notes and calendar events, with their open tasks on top.
const GoalActivity = ({ goal }: { goal: Goal }) => {
  const { applications, real } = useSource()
  // "~" sorts after any time on the last day.
  const events = useSavedEvents({ from: goal.start, to: `${goal.target}~` }) ?? []
  const read = useQuery(api.goalActivity.activity, real ? { id: goal.id as Id<"goals"> } : "skip")
  const mine = applications.filter((a) => a.goalId === goal.id)
  const byId = new Map(mine.map((a) => [a.id, a]))
  const inPeriod = (at: string) => at.slice(0, 10) >= goal.start && at.slice(0, 10) <= goal.target
  const items = [
    ...mine.flatMap((a) =>
      a.history.map((e) => ({ at: e.at, who: a.company, status: e.status, note: e.note }))
    ),
    ...(read?.notes ?? []).map((n) => ({ ...n, at: new Date(n.at).toISOString() })),
    ...(read?.mail ?? []).map((e) => ({ at: new Date(e.at).toISOString(), mail: e })),
    ...events
      .filter((e) => e.applicationId && byId.has(e.applicationId) && !e.hidden)
      .map((e) => ({ at: e.start, who: byId.get(e.applicationId!)!.company, title: e.title })),
  ]
    .filter((item) => inPeriod(item.at))
    .sort((x, y) => y.at.localeCompare(x.at))
    .slice(0, 50)
  const tasks = mine.flatMap((a) =>
    (a.tasks ?? []).filter((t) => !t.done).map((t) => ({ who: a.company, title: t.title }))
  )
  return (
    <section aria-label="Activity" className="flex flex-col gap-2">
      <span className="text-muted-foreground text-xs">
        Activity · {formatDate(goal.start)} → {formatDate(goal.target)}
      </span>
      {tasks.length === 0 && items.length === 0 && (
        <p className="text-muted-foreground text-[13px]">
          Nothing yet on this goal's applications.
        </p>
      )}
      {tasks.length > 0 && (
        <ul className="flex flex-col gap-1">
          {tasks.map((t, i) => (
            <li key={i} className="flex items-start gap-2 text-[13px]">
              <HugeiconsIcon
                icon={CircleIcon}
                className="text-muted-foreground mt-0.5 size-3.5 shrink-0"
              />
              <span className="min-w-0">
                <span className="text-muted-foreground">{t.who}:</span> {t.title}
              </span>
            </li>
          ))}
        </ul>
      )}
      <ol className="flex flex-col gap-2">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2 text-[13px]">
            {"mail" in item ? (
              <MailLine e={item.mail} />
            ) : (
              <>
                <HugeiconsIcon
                  icon={
                    "title" in item
                      ? Calendar03Icon
                      : "status" in item
                        ? ArrowMoveUpRightIcon
                        : Note01Icon
                  }
                  className="text-muted-foreground mt-0.5 size-3.5 shrink-0"
                />
                <span className="min-w-0 flex-1">
                  <span className="text-muted-foreground">{item.who}</span>{" "}
                  {"title" in item
                    ? item.title
                    : "status" in item
                      ? `moved to ${statusLabels[item.status]}${item.note ? ` · ${item.note}` : ""}`
                      : item.text}
                </span>
                <span className="text-muted-foreground shrink-0 text-xs">
                  {formatDate(item.at)}
                </span>
              </>
            )}
          </li>
        ))}
      </ol>
    </section>
  )
}

export const GoalDetail = ({ id }: { id: string }) => {
  const { goals, loaded } = useSource()
  const goal = goals.find((g) => g.id === id)
  if (!goal) {
    return (
      <>
        <PageHeader crumbs={[{ label: "Goals", to: "/goals" }, { label: loaded ? id : "…" }]} />
        {loaded && <p className="text-muted-foreground p-6 text-sm">No goal with id {id}.</p>}
      </>
    )
  }
  return (
    <Pipeline
      key={goal.id}
      crumbs={[{ label: "Goals", to: "/goals" }, { label: goal.name }]}
      filters={{ goal: [goal.id] }}
      display={{ layout: "list" }}
      summary={<GoalSummary goal={goal} />}
    />
  )
}
