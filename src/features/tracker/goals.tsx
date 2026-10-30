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
import { Textarea } from "@/components/ui/textarea"
import { PageHeader } from "@/features/shell/page-header"
import { cn } from "@/lib/utils"

import {
  type Application,
  type Goal,
  type Priority,
  formatDate,
  goalProgress,
  goalStatus,
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

// Creates a goal, or edits the one given. Milestones are one per line; a renamed
// milestone starts unticked.
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
      milestones: text("milestones")
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((name) => {
          const was = goal?.milestones.find((m) => m.name === name)
          return { name, done: was?.done ?? false, ...(was?.target && { target: was.target }) }
        }),
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
                defaultValue={goal?.milestones.map((m) => m.name).join("\n")}
                placeholder={"One per line, like:\nApply to 30 companies\nReach 5 interviews"}
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

// Goals as a timeline, newest first, like cycles. Each goal opens its applications.
export const Goals = () => {
  const { goals, applications, loaded } = useSource()
  const on = todayIso()
  const sorted = [...goals].sort((a, b) => b.start.localeCompare(a.start))
  return (
    <>
      <PageHeader
        crumbs={[{ label: "Tracker" }, { label: "Goals" }]}
        actions={
          <GoalDialog
            trigger={
              <Button variant="ghost" size="sm">
                <HugeiconsIcon icon={PlusSignIcon} /> New goal
              </Button>
            }
          />
        }
      />
      <ol className="flex flex-col py-2">
        {loaded && goals.length === 0 && (
          <li className="text-muted-foreground p-6 text-center text-[13px]">
            No goals yet. Make one, then put applications on it from their Goal property.
          </li>
        )}
        {sorted.map((goal, i) => {
          const status = goalStatus(goal, on)
          const progress = goalProgress(goal, on)
          const { items } = stats(goal, applications)
          return (
            <li
              key={goal.id}
              className="grid grid-cols-[4.5rem_1.5rem_minmax(0,1fr)] items-stretch"
            >
              <span className="text-muted-foreground pt-4 pe-2 text-end text-xs leading-tight">
                {formatDate(goal.start)}
              </span>
              <span className="relative flex justify-center">
                <span
                  className={cn(
                    "bg-border absolute w-px",
                    i === 0 ? "top-5 bottom-0" : i === sorted.length - 1 ? "top-0 h-5" : "inset-y-0"
                  )}
                />
                <span
                  className={cn(
                    "relative mt-[1.1rem] size-2 rounded-full border",
                    status === "Active" && "bg-primary border-primary",
                    status === "Completed" && "bg-muted-foreground border-muted-foreground",
                    status === "Upcoming" && "bg-background border-muted-foreground"
                  )}
                />
              </span>
              <Link
                to="/goals/$id"
                params={{ id: goal.id }}
                className="hover:bg-accent/50 me-3 flex min-w-0 items-center gap-3 rounded-md border-b px-3 py-3 text-[13px] transition-colors"
              >
                <HugeiconsIcon
                  icon={Target02Icon}
                  className="text-muted-foreground size-4 shrink-0"
                />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate font-medium">{goal.name}</span>
                  <span className="text-muted-foreground text-xs">
                    {formatDate(goal.start)} → {formatDate(goal.target)}
                  </span>
                </span>
                <span className="text-muted-foreground ms-auto hidden shrink-0 items-center gap-4 text-xs sm:flex">
                  <GoalBadge goal={goal} on={on} />
                  <span className="flex items-center gap-2">
                    <GoalMeter goal={goal} on={on} className="w-16" />
                    <span className="text-foreground w-8 tabular-nums">{progress}%</span>
                  </span>
                  <span>
                    <span className="text-foreground tabular-nums">
                      {goal.milestones.filter((m) => m.done).length}/{goal.milestones.length}
                    </span>{" "}
                    milestones
                  </span>
                  <span className="w-24">
                    <span className="text-foreground tabular-nums">{items}</span> applications
                  </span>
                </span>
              </Link>
            </li>
          )
        })}
      </ol>
    </>
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
