import {
  Calendar03Icon,
  Flag02Icon,
  PlusSignIcon,
  Tag01Icon,
  Target02Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { Link } from "@tanstack/react-router"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogFooter,
  DialogPanel,
  DialogPopup,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"

import { applications, formatDate, goalProgress, goals, priorityLabels, statusLabels } from "./data"
import { PriorityIcon, StatusIcon } from "./icons"
import { PageHeader } from "@/features/shell/page-header"

const Progress = ({ value }: { value: number }) => (
  <span className="flex items-center gap-2">
    <span className="bg-muted h-1.5 w-16 overflow-hidden rounded-full">
      <span className="bg-primary block h-full" style={{ width: `${value}%` }} />
    </span>
    <span className="text-muted-foreground w-9 text-xs tabular-nums">{value}%</span>
  </span>
)

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

export const Goals = () => (
  <>
    <PageHeader crumbs={[{ label: "Tracker" }, { label: "Goals" }]} actions={<NewGoalDialog />} />
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-muted-foreground text-xs">
          <tr className="border-b [&>th]:h-9 [&>th]:px-4 [&>th]:text-start [&>th]:font-normal">
            <th>Name</th>
            <th>Next milestone</th>
            <th>Priority</th>
            <th>Target</th>
            <th>Applications</th>
            <th>Progress</th>
          </tr>
        </thead>
        <tbody>
          {goals.map((goal) => {
            const next = goal.milestones.find((m) => !m.done)
            return (
              <tr key={goal.id} className="hover:bg-accent/50 border-b [&>td]:h-11 [&>td]:px-4">
                <td>
                  <Link
                    to="/goals/$id"
                    params={{ id: goal.id }}
                    className="flex items-center gap-2 font-medium"
                  >
                    <HugeiconsIcon icon={Target02Icon} className="text-muted-foreground size-4" />
                    {goal.name}
                  </Link>
                </td>
                <td className="text-muted-foreground">{next?.name ?? "All done"}</td>
                <td>
                  <PriorityIcon priority={goal.priority} />
                </td>
                <td className="text-muted-foreground">{formatDate(goal.target)}</td>
                <td className="tabular-nums">
                  {applications.filter((a) => a.goalId === goal.id).length}
                </td>
                <td>
                  <Progress value={goalProgress(goal)} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  </>
)

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
  const items = applications.filter((a) => a.goalId === goal.id)
  return (
    <>
      <PageHeader crumbs={[{ label: "Goals", to: "/goals" }, { label: goal.name }]} />
      <main className="flex max-w-3xl flex-col gap-8 p-6 lg:px-12">
        <div className="flex flex-col gap-2">
          <h2 className="font-heading text-2xl font-semibold">{goal.name}</h2>
          <p className="text-muted-foreground">{goal.summary}</p>
          <div className="text-muted-foreground flex flex-wrap items-center gap-4 text-sm">
            <span className="flex items-center gap-1.5">
              <PriorityIcon priority={goal.priority} /> {priorityLabels[goal.priority]}
            </span>
            <span className="flex items-center gap-1.5">
              <HugeiconsIcon icon={Calendar03Icon} className="size-3.5" /> Target{" "}
              {formatDate(goal.target)}
            </span>
            <Progress value={goalProgress(goal)} />
          </div>
        </div>
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-medium">Milestones</h3>
          <ol className="flex flex-col rounded-lg border">
            {goal.milestones.map((m) => (
              <li
                key={m.name}
                className="flex items-center gap-3 border-b px-3 py-2.5 text-sm last:border-b-0"
              >
                <StatusIcon status={m.done ? "offer" : "applied"} />
                <span className={m.done ? "text-muted-foreground line-through" : ""}>{m.name}</span>
                {m.target && (
                  <span className="text-muted-foreground ms-auto text-xs">
                    {formatDate(m.target)}
                  </span>
                )}
              </li>
            ))}
          </ol>
        </section>
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-medium">Applications ({items.length})</h3>
          <ul className="flex flex-col rounded-lg border">
            {items.map((a) => (
              <li key={a.id} className="border-b last:border-b-0">
                <Link
                  to="/pipeline/$id"
                  params={{ id: a.id }}
                  className="hover:bg-accent/50 flex items-center gap-3 px-3 py-2.5 text-sm"
                >
                  <StatusIcon status={a.status} />
                  <span className="truncate">
                    {a.role} <span className="text-muted-foreground">· {a.company}</span>
                  </span>
                  <span className="text-muted-foreground ms-auto text-xs">
                    {statusLabels[a.status]}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </>
  )
}
