import {
  ArrowExpand01Icon,
  Building03Icon,
  Cancel01Icon,
  CheckmarkCircle02Icon,
  CircleIcon,
  Note01Icon,
  PlusSignIcon,
  Location01Icon,
  Mail01Icon,
  Tag01Icon,
  Target02Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { Link } from "@tanstack/react-router"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Menu,
  MenuCheckboxItem,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuTrigger,
} from "@/components/ui/menu"
import { ScrollArea } from "@/components/ui/scroll-area"
import { PageHeader } from "@/features/shell/page-header"

import {
  type Application,
  type FilterField,
  type Label,
  type Method,
  type Priority,
  type Status,
  fieldOptions,
  formatDate,
  goalName,
  priorityLabels,
  statusLabels,
} from "./data"
import { PriorityBadge, TopBadges } from "./badges"
import { PriorityIcon, StatusIcon } from "./icons"
import { JobContext } from "./job"
import { MailLine, Suggestion, useMailFor } from "./mail"
import { useSource } from "./source"

const icon = (field: FilterField, value: string) =>
  field === "status" ? (
    <StatusIcon status={value as Status} />
  ) : field === "priority" ? (
    <PriorityIcon priority={value as Priority} />
  ) : null

const Trigger = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <MenuTrigger
    render={
      <Button
        variant="ghost"
        size="xs"
        aria-label={label}
        className="h-7 w-full justify-start gap-1.5 truncate px-2 font-normal sm:h-7"
      />
    }
  >
    {children}
  </MenuTrigger>
)

// A property with a single value, picked from a menu of every option.
const Pick = ({
  label,
  field,
  value,
  onChange,
  children,
}: {
  label: string
  field: FilterField
  value: string
  onChange: (value: string) => void
  children: React.ReactNode
}) => (
  <Menu>
    <Trigger label={label}>{children}</Trigger>
    <MenuPopup align="start" className="min-w-44">
      <MenuRadioGroup value={value} onValueChange={(v) => onChange(v as string)}>
        {fieldOptions(field).map((o) => (
          <MenuRadioItem key={o.value} value={o.value}>
            <span className="flex items-center gap-2">
              {icon(field, o.value)}
              {o.label}
            </span>
          </MenuRadioItem>
        ))}
      </MenuRadioGroup>
    </MenuPopup>
  </Menu>
)

const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <>
    <dt className="text-muted-foreground flex h-7 items-center text-xs">{label}</dt>
    <dd className="min-w-0">{children}</dd>
  </>
)

// Read-only value, padded to line up with the picker buttons above it.
const Static = ({ children }: { children: React.ReactNode }) => (
  <span className="flex h-7 min-w-0 items-center gap-1.5 px-2">{children}</span>
)

const muted = "text-muted-foreground size-3.5"

const Properties = ({ a }: { a: Application }) => {
  const source = useSource()
  const set = (patch: Parameters<typeof source.update>[1]) => source.update(a.id, patch)
  const setStatus = (_: Application, status: Status) => source.setStatus(a.id, status)
  return (
    <dl className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-1 gap-y-0.5 text-[13px]">
      <Row label="Status">
        <Pick
          label="Status"
          field="status"
          value={a.status}
          onChange={(v) => setStatus(a, v as Status)}
        >
          <StatusIcon status={a.status} /> {statusLabels[a.status]}
        </Pick>
      </Row>
      <Row label="Priority">
        <Pick
          label="Priority"
          field="priority"
          value={a.priority}
          onChange={(v) => set({ priority: v as Priority })}
        >
          <PriorityIcon priority={a.priority} /> {priorityLabels[a.priority]}
        </Pick>
      </Row>
      {source.goals && (
        <Row label="Goal">
          <Pick
            label="Goal"
            field="goal"
            value={a.goalId ?? "none"}
            onChange={(v) => source.setGoal(a.id, v === "none" ? undefined : v)}
          >
            <HugeiconsIcon icon={Target02Icon} className={muted} />
            <span className="truncate">{goalName(a.goalId)}</span>
          </Pick>
        </Row>
      )}
      <Row label="Labels">
        <Menu>
          <Trigger label="Labels">
            <HugeiconsIcon icon={Tag01Icon} className={muted} />
            <span className="truncate">{a.labels.join(", ") || "Add labels"}</span>
          </Trigger>
          <MenuPopup align="start" className="min-w-44">
            {fieldOptions("label", source.applications).map((o) => (
              <MenuCheckboxItem
                key={o.value}
                checked={a.labels.includes(o.value as Label)}
                onCheckedChange={(on) =>
                  set({
                    labels: on
                      ? [...a.labels, o.value as Label]
                      : a.labels.filter((l) => l !== o.value),
                  })
                }
              >
                {o.label}
              </MenuCheckboxItem>
            ))}
          </MenuPopup>
        </Menu>
      </Row>
      <Row label="Applied via">
        <Pick
          label="Applied via"
          field="method"
          value={a.method}
          onChange={(v) => set({ method: v as Method })}
        >
          <HugeiconsIcon icon={Mail01Icon} className={muted} /> {a.method}
        </Pick>
      </Row>
      <Row label="Company">
        <Static>
          <HugeiconsIcon icon={Building03Icon} className={muted} />
          <span className="truncate">{a.company}</span>
        </Static>
      </Row>
      <Row label="Location">
        <Static>
          <HugeiconsIcon icon={Location01Icon} className={muted} />
          <span className="truncate">{a.location}</span>
        </Static>
      </Row>
      <Row label="Created">
        <Static>{formatDate(a.createdAt)}</Static>
      </Row>
    </dl>
  )
}

// Title, tasks, notes and activity. The page and the side panel both render it;
// `properties` goes under the title when there's no room for a sidebar.
const Content = ({ a, properties }: { a: Application; properties?: React.ReactNode }) => {
  const [draft, setDraft] = useState("")
  const [note, setNote] = useState("")
  const [adding, setAdding] = useState(false)
  const source = useSource()
  const set = (patch: Parameters<typeof source.update>[1]) => source.update(a.id, patch)
  const tasks = a.tasks ?? []
  const notes = a.notes ?? []
  const mail = useMailFor(a.id)
  // Merges status changes, notes and mail into one timeline. The sort is stable, so
  // same-day items keep their order.
  const activity = [
    ...a.history,
    ...notes,
    ...mail.map((e) => ({ mail: e, at: new Date(e.at).toISOString() })),
  ].sort((x, y) => x.at.localeCompare(y.at))
  return (
    <>
      <div className="flex flex-col gap-2">
        <div>
          <h2 className="font-heading text-xl leading-tight font-semibold text-balance">
            {a.role}
          </h2>
          <p className="text-muted-foreground text-sm">
            {a.company}
            {a.location.trim() && ` · ${a.location}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-1">
          <TopBadges a={a} />
          <PriorityBadge a={a} />
        </div>
        <p className="text-foreground/90 text-[13px] leading-relaxed">{a.description}</p>
      </div>
      {properties}
      <section aria-label="Tasks" className="flex flex-col">
        {tasks.length > 0 && (
          <h3 className="text-muted-foreground mb-1 text-xs font-medium">
            Tasks · {tasks.filter((t) => t.done).length}/{tasks.length}
          </h3>
        )}
        {tasks.map((task, i) => (
          <button
            key={i}
            type="button"
            role="checkbox"
            aria-checked={task.done}
            onClick={() =>
              set({ tasks: tasks.map((t, j) => (j === i ? { ...t, done: !t.done } : t)) })
            }
            className="hover:bg-accent/50 -mx-2 flex h-8 items-center gap-2 rounded-md px-2 text-start text-[13px]"
          >
            <HugeiconsIcon
              icon={task.done ? CheckmarkCircle02Icon : CircleIcon}
              className={task.done ? "size-4 text-emerald-500" : "text-muted-foreground size-4"}
            />
            <span className={task.done ? "text-muted-foreground line-through" : ""}>
              {task.title}
            </span>
          </button>
        ))}
        {adding ? (
          <form
            className="-mx-2 flex h-8 items-center gap-2 px-2"
            onSubmit={(e) => {
              e.preventDefault()
              if (draft.trim()) set({ tasks: [...tasks, { title: draft.trim(), done: false }] })
              setDraft("")
            }}
          >
            <HugeiconsIcon icon={CircleIcon} className="text-muted-foreground size-4" />
            <input
              autoFocus
              aria-label="New task"
              placeholder="Task name, then Enter"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => !draft && setAdding(false)}
              onKeyDown={(e) => e.key === "Escape" && (setDraft(""), setAdding(false))}
              className="placeholder:text-muted-foreground flex-1 bg-transparent text-[13px] outline-none"
            />
          </form>
        ) : (
          <Button
            variant="ghost"
            size="xs"
            className="text-muted-foreground -ms-2 self-start"
            onClick={() => setAdding(true)}
          >
            <HugeiconsIcon icon={PlusSignIcon} /> Add task
          </Button>
        )}
      </section>

      <JobContext a={a} />

      <section aria-label="Activity" className="flex flex-col gap-3 border-t pt-6">
        <h3 className="text-[13px] font-medium">Activity</h3>
        <Suggestion mail={mail} />
        <ol className="flex flex-col gap-3">
          {activity.map((item, i) => (
            <li key={i} className="flex items-start gap-2.5 text-[13px]">
              {"mail" in item ? (
                <MailLine e={item.mail} />
              ) : "status" in item ? (
                <>
                  <StatusIcon status={item.status} className="mt-0.5" />
                  <span className="text-muted-foreground min-w-0">
                    Moved to{" "}
                    <span className="text-foreground font-medium">{statusLabels[item.status]}</span>
                    {item.note && <> · {item.note}</>}
                  </span>
                </>
              ) : (
                <>
                  <HugeiconsIcon
                    icon={Note01Icon}
                    className="text-muted-foreground mt-0.5 size-3.5 shrink-0"
                  />
                  <span className="min-w-0">{item.text}</span>
                </>
              )}
              {/* A mail line shows its own date. */}
              {!("mail" in item) && (
                <span className="text-muted-foreground ms-auto shrink-0 text-xs">
                  {formatDate(item.at)}
                </span>
              )}
            </li>
          ))}
        </ol>
        <form
          className="focus-within:border-ring/60 rounded-lg border transition-colors"
          onSubmit={(e) => {
            e.preventDefault()
            if (!note.trim()) return
            source.addNote(a.id, note.trim())
            setNote("")
          }}
        >
          <textarea
            aria-label="Add a note"
            placeholder="Leave a note…"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="placeholder:text-muted-foreground block min-h-12 w-full resize-none bg-transparent px-3 pt-2.5 text-[13px] outline-none [field-sizing:content]"
          />
          <div className="flex justify-end px-2 pb-2">
            <Button size="xs" type="submit" disabled={!note.trim()}>
              Add note
            </Button>
          </div>
        </form>
      </section>
    </>
  )
}

export const ApplicationDetail = ({ id }: { id: string }) => {
  const { applications, loaded } = useSource()
  const a = applications.find((x) => x.id === id)
  if (!loaded) return null
  if (!a) {
    return (
      <>
        <PageHeader crumbs={[{ label: "Applications", to: "/" }, { label: id }]} />
        <p className="text-muted-foreground p-6 text-sm">No application with id {id}.</p>
      </>
    )
  }
  return (
    <>
      <PageHeader
        crumbs={[
          { label: "Applications", to: "/" },
          { label: a.code ? `${a.code} ${a.role}` : a.role },
        ]}
      />
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <ScrollArea render={<main />} className="min-w-0 flex-1">
          <div className="mx-auto flex max-w-3xl flex-col gap-8 px-8 py-8">
            <Content a={a} />
          </div>
        </ScrollArea>
        <aside
          aria-label="Properties"
          className="border-t px-4 py-6 lg:w-72 lg:border-s lg:border-t-0"
        >
          <Properties a={a} />
        </aside>
      </div>
    </>
  )
}

// The same application in the pipeline's side panel, with a link to the full page.
export const ApplicationPeek = ({ id, onClose }: { id: string; onClose: () => void }) => {
  const a = useSource().applications.find((x) => x.id === id)
  if (!a) return null
  return (
    <div className="flex h-full flex-col">
      <header className="flex h-10 shrink-0 items-center gap-1 border-b px-3">
        <span className="text-muted-foreground text-xs">{a.code ?? a.company}</span>
        <Button
          variant="ghost"
          size="xs"
          className="ms-auto"
          render={<Link to="/pipeline/$id" params={{ id: a.id }} />}
        >
          <HugeiconsIcon icon={ArrowExpand01Icon} /> Open
        </Button>
        <Button variant="ghost" size="icon-xs" aria-label="Close panel" onClick={onClose}>
          <HugeiconsIcon icon={Cancel01Icon} />
        </Button>
      </header>
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-6 p-5">
          <Content key={a.id} a={a} properties={<Properties a={a} />} />
        </div>
      </ScrollArea>
    </div>
  )
}
