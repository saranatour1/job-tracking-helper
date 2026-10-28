import {
  Calendar03Icon,
  Flag02Icon,
  PlusSignIcon,
  Tag01Icon,
  Target02Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { Link } from "@tanstack/react-router"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogFooter,
  DialogPanel,
  DialogPopup,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Meter, MeterIndicator, MeterTrack } from "@/components/ui/meter"
import { Textarea } from "@/components/ui/textarea"
import { chip, PageIntro, pageBody, Tile, tile } from "@/features/shell/page-body"
import { PageHeader } from "@/features/shell/page-header"
import { cn } from "@/lib/utils"

import {
  type Goal,
  applications,
  formatDate,
  goalProgress,
  goalStatus,
  goals,
  priorityLabels,
} from "./data"
import { PriorityIcon } from "./icons"
import { Pipeline } from "./pipeline"

const statusBadge = { Active: "info", Upcoming: "outline", Completed: "success" } as const

const GoalBadge = ({ goal }: { goal: Goal }) => {
  const status = goalStatus(goal)
  return (
    <Badge variant={statusBadge[status]} className="font-normal">
      {status}
    </Badge>
  )
}

const GoalMeter = ({ goal, className }: { goal: Goal; className?: string }) => (
  <Meter value={goalProgress(goal)} aria-label={`${goal.name} progress`} className={className}>
    <MeterTrack className="h-1.5 rounded-full">
      <MeterIndicator className="rounded-full" />
    </MeterTrack>
  </Meter>
)

const stats = (goal: Goal) => {
  const items = applications.filter((a) => a.goalId === goal.id)
  const reached = (s: string) => items.filter((a) => a.history.some((e) => e.status === s)).length
  return { items: items.length, interviews: reached("interviewing"), offers: reached("offer") }
}

// shortcut: "Create goal" does nothing until goals are stored in Convex.
const NewGoalDialog = () => (
  <Dialog>
    <DialogTrigger
      render={
        <Button variant="ghost" size="sm">
          <HugeiconsIcon icon={PlusSignIcon} /> New goal
        </Button>
      }
    />
    <DialogPopup className="sm:max-w-2xl">
      <DialogPanel className="flex flex-col gap-4 pt-6">
        <span className="bg-muted flex size-9 items-center justify-center rounded-md">
          <HugeiconsIcon icon={Target02Icon} className="size-4.5" />
        </span>
        <DialogTitle className="sr-only">New goal</DialogTitle>
        <input
          aria-label="Goal name"
          placeholder="Goal name"
          className="font-heading placeholder:text-muted-foreground/60 bg-transparent text-2xl font-semibold outline-none"
        />
        <input
          aria-label="Summary"
          placeholder="Add a short summary…"
          className="placeholder:text-muted-foreground/60 bg-transparent outline-none"
        />
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              [Flag02Icon, "No priority"],
              [Calendar03Icon, "Target date"],
              [Tag01Icon, "Labels"],
            ] as const
          ).map(([icon, label]) => (
            <Button key={label} variant="outline" size="xs" className="rounded-full">
              <HugeiconsIcon icon={icon} /> {label}
            </Button>
          ))}
        </div>
        <Textarea
          aria-label="Description"
          placeholder="Why this goal matters, and what done looks like…"
          className="min-h-32"
        />
        <div className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
          <span className="font-medium">Milestones</span>
          <Button variant="ghost" size="icon-xs" aria-label="Add milestone">
            <HugeiconsIcon icon={PlusSignIcon} />
          </Button>
        </div>
      </DialogPanel>
      <DialogFooter>
        <Button type="button">Create goal</Button>
      </DialogFooter>
    </DialogPopup>
  </Dialog>
)

// Goals as a timeline, newest first, like cycles. Each goal opens its applications.
export const Goals = () => {
  const sorted = [...goals].sort((a, b) => b.start.localeCompare(a.start))
  return (
    <>
      <PageHeader crumbs={[{ label: "Tracker" }, { label: "Goals" }]} actions={<NewGoalDialog />} />
      <main className={pageBody}>
        <PageIntro
          title="Goals"
          description="Stretches of your search with a target date, newest first. Each opens its applications."
        />
        <ol className="flex flex-col">
          {sorted.map((goal, i) => {
            const status = goalStatus(goal)
            const progress = goalProgress(goal)
            const { items } = stats(goal)
            return (
              <li
                key={goal.id}
                className="grid grid-cols-[4.5rem_1.5rem_minmax(0,1fr)] items-stretch"
              >
                <span className="text-muted-foreground pt-5 pe-2 text-end text-xs leading-tight">
                  {formatDate(goal.start)}
                </span>
                <span className="relative flex justify-center">
                  <span
                    className={cn(
                      "bg-border absolute w-px",
                      i === 0
                        ? "top-6 bottom-0"
                        : i === sorted.length - 1
                          ? "top-0 h-6"
                          : "inset-y-0"
                    )}
                  />
                  <span
                    className={cn(
                      "relative mt-[1.3rem] size-2 rounded-full border",
                      status === "Active" && "bg-primary border-primary",
                      status === "Completed" && "bg-muted-foreground border-muted-foreground",
                      status === "Upcoming" && "bg-background border-muted-foreground"
                    )}
                  />
                </span>
                <Link
                  to="/goals/$id"
                  params={{ id: goal.id }}
                  className={cn(
                    tile,
                    "hover:bg-accent/30 mb-3 min-w-0 text-[13px] transition-colors"
                  )}
                >
                  <span className="flex items-center gap-2">
                    <span className={cn(chip, "flex min-w-0 items-center gap-1.5")}>
                      <HugeiconsIcon
                        icon={Target02Icon}
                        className="text-muted-foreground size-3.5 shrink-0"
                      />
                      <span className="truncate">{goal.name}</span>
                    </span>
                    <span className="ms-auto">
                      <GoalBadge goal={goal} />
                    </span>
                  </span>
                  <span className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-xs">
                    <span>
                      {formatDate(goal.start)} → {formatDate(goal.target)}
                    </span>
                    <span className="flex items-center gap-2">
                      <GoalMeter goal={goal} className="w-16" />
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
      </main>
    </>
  )
}

// The goal's side panel: dates, progress, milestones and how its applications are doing.
const GoalSummary = ({ goal }: { goal: Goal }) => {
  const { items, interviews, offers } = stats(goal)
  return (
    <div className="flex flex-col gap-3">
      <Tile
        label={goal.name}
        title={
          <h2 className={cn(chip, "me-auto flex min-w-0 items-center gap-1.5")}>
            <HugeiconsIcon icon={Target02Icon} className="text-muted-foreground size-3.5" />
            <span className="truncate">{goal.name}</span>
          </h2>
        }
        actions={<GoalBadge goal={goal} />}
        className="gap-3"
      >
        <div className="flex flex-col gap-1 px-1">
          <span className="text-muted-foreground text-xs">
            {formatDate(goal.start)} → {formatDate(goal.target)}
          </span>
          <p className="text-muted-foreground text-[13px]">{goal.summary}</p>
        </div>
        <GoalMeter goal={goal} />
        <dl className="grid grid-cols-3 gap-2 text-xs">
          {(
            [
              ["Progress", `${goalProgress(goal)}%`],
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
      </Tile>
      <Tile
        title="Milestones"
        actions={
          <span className="text-muted-foreground flex items-center gap-1 text-xs">
            <PriorityIcon priority={goal.priority} className="size-3" />
            {priorityLabels[goal.priority]}
          </span>
        }
      >
        <ol className="flex flex-col px-1">
          {goal.milestones.map((m) => (
            <li key={m.name} className="flex items-center gap-2 py-1 text-[13px]">
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
            </li>
          ))}
        </ol>
      </Tile>
    </div>
  )
}

export const GoalDetail = ({ id }: { id: string }) => {
  const goal = goals.find((g) => g.id === id)
  if (!goal) {
    return (
      <>
        <PageHeader crumbs={[{ label: "Goals", to: "/goals" }, { label: id }]} />
        <p className="text-muted-foreground p-6 text-sm">No goal with id {id}.</p>
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
