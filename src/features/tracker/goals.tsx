import { api } from "@convex/_generated/api"
import type { Id } from "@convex/_generated/dataModel"
import { PlusSignIcon, Target02Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { Link, useNavigate } from "@tanstack/react-router"
import { useMutation } from "convex/react"
import { ConvexError } from "convex/values"
import { useActionState, useRef } from "react"

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
import { Section } from "@/features/account/settings"
import { PageIntro, pageBody } from "@/features/shell/page-body"
import { PageHeader } from "@/features/shell/page-header"
import { cn } from "@/lib/utils"

import {
  type Application,
  type Goal,
  type Priority,
  formatDate,
  goalProgress,
  goalStatus,
  milestoneLine,
  parseMilestones,
  priorities,
  priorityLabels,
} from "./data"
import { PriorityIcon } from "./icons"
import { Pipeline } from "./pipeline"
import { useSource } from "./source"

// Today as YYYY-MM-DD, the form a goal's dates take.
const todayIso = () => new Date().toISOString().slice(0, 10)

const statusBadge = { Active: "info", Upcoming: "outline", Completed: "success" } as const

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

const stats = (goal: Goal, applications: Application[]) => {
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
            <div className="grid grid-cols-3 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="goal-start">Start</Label>
                <Input
                  id="goal-start"
                  name="start"
                  type="date"
                  defaultValue={goal?.start ?? todayIso()}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="goal-target">Target</Label>
                <Input id="goal-target" name="target" type="date" defaultValue={goal?.target} />
              </div>
              <div className="grid gap-1.5">
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
  const { items } = stats(goal, applications)
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3">
      <Link
        to="/goals/$id"
        params={{ id: goal.id }}
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

// Your goals, newest first, with the done ones below. Laid out like the Workflows page.
export const Goals = () => {
  const { goals, loaded } = useSource()
  const on = todayIso()
  const sorted = [...goals].sort((a, b) => b.start.localeCompare(a.start))
  const open = sorted.filter((g) => goalStatus(g, on) !== "Completed")
  const done = sorted.filter((g) => goalStatus(g, on) === "Completed")
  return (
    <div className="flex h-svh flex-col md:h-[calc(100svh-1rem)]">
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
            <Section title="Done">
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
  const { applications } = useSource()
  const update = useMutation(api.goals.update)
  const remove = useMutation(api.goals.remove)
  const navigate = useNavigate()
  const on = todayIso()
  const { items, interviews, offers } = stats(goal, applications)
  const id = goal.id as Id<"goals">
  const tick = (name: string) =>
    update({
      id,
      milestones: goal.milestones.map((m) => (m.name === name ? { ...m, done: !m.done } : m)),
    })
  return (
    <div className="flex flex-col gap-4 border-b pb-4">
      <div className="text-muted-foreground flex items-center gap-2 text-xs">
        <GoalBadge goal={goal} on={on} />
        <span>
          {formatDate(goal.start)} → {formatDate(goal.target)}
        </span>
        <span className="ms-auto flex gap-1">
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
      </div>
      <GoalMeter goal={goal} on={on} />
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
    </div>
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
