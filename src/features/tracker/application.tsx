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
import { addChip, PageIntro, pageBody, Tile } from "@/features/shell/page-body"
import { PageHeader } from "@/features/shell/page-header"
import { cn } from "@/lib/utils"

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
  today,
  updateApplication,
  useApplications,
} from "./data"
import { PriorityIcon, StatusIcon } from "./icons"

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

const setStatus = (a: Application, status: Status) =>
  status !== a.status &&
  updateApplication(a.id, { status, history: [...a.history, { status, at: today }] })

const Properties = ({ a }: { a: Application }) => {
  const set = (patch: Partial<Application>) => updateApplication(a.id, patch)
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
      <Row label="Goal">
        <Pick
          label="Goal"
          field="goal"
          value={a.goalId ?? "none"}
          onChange={(v) => set({ goalId: v === "none" ? undefined : v })}
        >
          <HugeiconsIcon icon={Target02Icon} className={muted} />
          <span className="truncate">{goalName(a.goalId)}</span>
        </Pick>
      </Row>
      <Row label="Labels">
        <Menu>
          <Trigger label="Labels">
            <HugeiconsIcon icon={Tag01Icon} className={muted} />
            <span className="truncate">{a.labels.join(", ") || "Add labels"}</span>
          </Trigger>
          <MenuPopup align="start" className="min-w-44">
            {fieldOptions("label").map((o) => (
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
  const set = (patch: Partial<Application>) => updateApplication(a.id, patch)
  const tasks = a.tasks ?? []
  const notes = a.notes ?? []
  // Merges status changes and notes into one timeline. The sort is stable, so same-day items keep their order.
  const activity = [...a.history, ...notes].sort((x, y) => x.at.localeCompare(y.at))
  return (
    <>
      <div className="flex flex-col gap-2">
        <PageIntro title={a.role} description={a.company} />
        <p className="text-foreground/90 text-[13px] leading-relaxed">{a.description}</p>
      </div>
      {properties}
      <Tile
        label="Tasks"
        title={
          tasks.length ? `Tasks · ${tasks.filter((t) => t.done).length}/${tasks.length}` : "Tasks"
        }
        actions={
          !adding && (
            <button type="button" className={addChip} onClick={() => setAdding(true)}>
              <HugeiconsIcon icon={PlusSignIcon} className="size-3.5" /> Task
            </button>
          )
        }
        className="gap-0"
      >
        {tasks.map((task, i) => (
          <button
            key={i}
            type="button"
            role="checkbox"
            aria-checked={task.done}
            onClick={() =>
              set({ tasks: tasks.map((t, j) => (j === i ? { ...t, done: !t.done } : t)) })
            }
            className="hover:bg-accent/50 flex h-8 items-center gap-2 rounded-md px-2 text-start text-[13px]"
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
            className="flex h-8 items-center gap-2 px-2"
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
          tasks.length === 0 && (
            <p className="text-muted-foreground px-2 py-1 text-xs">No tasks yet.</p>
          )
        )}
      </Tile>

      <Tile title="Activity" className="gap-3">
        <ol className="flex flex-col gap-3 px-1">
          {activity.map((item, i) => (
            <li key={i} className="flex items-start gap-2.5 text-[13px]">
              {"status" in item ? (
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
              <span className="text-muted-foreground ms-auto shrink-0 text-xs">
                {formatDate(item.at)}
              </span>
            </li>
          ))}
        </ol>
        <form
          className="focus-within:border-ring/60 rounded-lg border transition-colors"
          onSubmit={(e) => {
            e.preventDefault()
            if (!note.trim()) return
            set({ notes: [...notes, { text: note.trim(), at: today }] })
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
      </Tile>
    </>
  )
}

export const ApplicationDetail = ({ id }: { id: string }) => {
  const a = useApplications().find((x) => x.id === id)
  if (!a) {
    return (
      <>
        <PageHeader crumbs={[{ label: "Pipeline", to: "/pipeline" }, { label: id }]} />
        <p className="text-muted-foreground p-6 text-sm">No application with id {id}.</p>
      </>
    )
  }
  return (
    <>
      <PageHeader
        crumbs={[{ label: "Pipeline", to: "/pipeline" }, { label: `${a.id} ${a.role}` }]}
      />
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <ScrollArea render={<main />} className="min-w-0 flex-1">
          <div className={cn(pageBody, "max-w-3xl")}>
            <Content a={a} />
          </div>
        </ScrollArea>
        <aside
          aria-label="Properties"
          className="border-t px-4 py-6 lg:w-72 lg:border-s lg:border-t-0"
        >
          <Tile title="Properties">
            <Properties a={a} />
          </Tile>
        </aside>
      </div>
    </>
  )
}

// The same application in the pipeline's side panel, with a link to the full page.
export const ApplicationPeek = ({ id, onClose }: { id: string; onClose: () => void }) => {
  const a = useApplications().find((x) => x.id === id)
  if (!a) return null
  return (
    <div className="flex h-full flex-col">
      <header className="flex h-10 shrink-0 items-center gap-1 border-b px-3">
        <span className="text-muted-foreground text-xs">{a.id}</span>
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
          <Content
            key={a.id}
            a={a}
            properties={
              <Tile title="Properties">
                <Properties a={a} />
              </Tile>
            }
          />
        </div>
      </ScrollArea>
    </div>
  )
}
