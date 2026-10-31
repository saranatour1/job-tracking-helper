import { dateText, routeIds, useLoopRoutes } from "@/lib/route-ids"
import { api } from "@/lib/api"
import type { Doc, Id } from "@convex/_generated/dataModel"
import { vDraft, problemOf, type Step } from "@convex/features/automations/validators"
import { HugeiconsIcon } from "@hugeicons/react"
import { useForm, useStore } from "@tanstack/react-form"
import { validate } from "convex-helpers/validators"
import { useNavigate, useSearch } from "@tanstack/react-router"
import { useMutation } from "convex/react"
import { useQuery } from "convex-helpers/react/cache/hooks"
import { startTransition, useActionState, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Sheet, SheetPopup, SheetTrigger } from "@/components/ui/sheet"
import { Switch } from "@/components/ui/switch"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { messageOf } from "@/features/account/settings"
import { useCalendarSettings } from "@/features/calendar/saved"
import { PageHeader } from "@/features/shell/page-header"
import { cn } from "@/lib/utils"
import { blockKinds, blocks, branches } from "./blocks"
import { Canvas, type InsertKind, type StepStatus } from "./canvas"
import { StepSettings } from "./step-settings"
import { blank, type Draft, draftOf, type TemplateName, templates } from "./templates"
import { branchAt, insert, remove, type Slot } from "./tree"

// `template` and `loop` only matter for a new workflow: what it starts as. A top-level
// step's place is a number in the address, so it reads ?step=2: the router quotes
// strings that look like numbers.
export type WorkflowSearch = {
  step?: string | number
  tab?: "history"
  run?: string
  template?: TemplateName
  loop?: string
  draft?: Draft
}
export const workflowSearch = (search: Record<string, unknown>): WorkflowSearch => ({
  step:
    typeof search.step === "string" || typeof search.step === "number" ? search.step : undefined,
  tab: search.tab === "history" ? "history" : undefined,
  run: typeof search.run === "string" ? search.run : undefined,
  template:
    typeof search.template === "string" && search.template in templates
      ? (search.template as TemplateName)
      : undefined,
  loop: typeof search.loop === "string" ? search.loop : undefined,
  draft: validate(vDraft, search.draft) ? (search.draft as Draft) : undefined,
})

// The browser's zone, not the Calendar's: the Calendar's arrives later, and a draft that
// changed under you would look edited.
const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone

// JSON with keys in order, so a saved workflow (whose fields Convex may reorder) still
// compares equal to the draft it was saved from.
const stable = (value: unknown) =>
  JSON.stringify(value, (_, v: unknown) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)))
      : v
  )

const dot: Record<Doc<"automationRuns">["status"], string> = {
  running: "bg-info",
  done: "bg-success",
  failed: "bg-destructive",
  canceled: "bg-muted-foreground",
}

const when = (ms: number) =>
  new Date(ms).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })

const startedBy = { manual: "Run now", schedule: "Scheduled", event: "Event" } as const

// Runs on the left in History: how many ended which way, then the latest ones.
const RunList = ({
  automationId,
  selected,
}: {
  automationId: Id<"automations">
  selected?: string
}) => {
  const runs = useQuery(api.automations.runs, { automationId }) ?? []
  const routes = routeIds(
    runs,
    (r) => r._id,
    (r) => dateText(r.startedAt)
  )
  const counts = useQuery(api.automations.counts, { automationId })
  const navigate = useNavigate({ from: "/workflows/$id" })
  return (
    <div className="flex flex-col gap-3">
      {counts && (
        <p className="text-muted-foreground px-1 text-xs">
          {counts.done} done · {counts.failed} failed
          {counts.canceled ? ` · ${counts.canceled} stopped` : ""}
          {counts.running ? ` · ${counts.running} running` : ""}
        </p>
      )}
      {runs.length === 0 && <p className="text-muted-foreground px-1 text-[13px]">No runs yet.</p>}
      <ul className="flex flex-col gap-0.5">
        {runs.map((run) => (
          <li key={run._id}>
            <button
              type="button"
              onClick={() =>
                void navigate({
                  search: (s) => ({ ...s, run: routes.text(run._id) }),
                  replace: true,
                })
              }
              className={cn(
                "hover:bg-accent/50 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-start transition-colors",
                selected === run._id && "bg-accent"
              )}
            >
              <span className={cn("size-2 shrink-0 rounded-full", dot[run.status])} />
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-[13px] font-medium">{when(run.startedAt)}</span>
                <span className="text-muted-foreground truncate text-xs">
                  {startedBy[run.trigger]} · {run.status}
                  {run.error ? ` · ${run.error}` : ""}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

// One step of a past run, beside the canvas in History.
const LogEntry = ({ run, at }: { run: Doc<"automationRuns">; at: string }) => {
  const entry = run.log.find((e) => e.at === at)
  if (!entry) return <p className="text-muted-foreground text-[13px]">This step didn't run.</p>
  return (
    <div className="grid gap-2 text-[13px]">
      <p className="font-medium capitalize">{entry.status}</p>
      {entry.output && <p className="text-muted-foreground whitespace-pre-wrap">{entry.output}</p>}
      {entry.error && <p className="text-destructive">{entry.error}</p>}
      <p className="text-muted-foreground text-xs">
        Started {when(entry.startedAt)}
        {entry.finishedAt ? `, finished ${when(entry.finishedAt)}` : ""}
      </p>
    </div>
  )
}

const Editor = ({ saved }: { saved?: Doc<"automations"> }) => {
  const search = useSearch({ from: "/_app/workflows/$id" })
  const navigate = useNavigate({ from: "/workflows/$id" })
  const write = (patch: WorkflowSearch) =>
    void navigate({
      search: (s) => ({
        ...s,
        ...patch,
        ...(typeof patch.step === "string" &&
          /^\d+$/.test(patch.step) && { step: Number(patch.step) }),
      }),
      replace: true,
    })
  const at = search.step === undefined ? undefined : String(search.step)
  const save = useMutation(api.automations.save)
  const runNow = useMutation(api.automations.runNow)
  const stopRun = useMutation(api.automations.stopRun)
  const remove_ = useMutation(api.automations.remove)
  const applications = useQuery(api.applications.list) ?? []
  const loops = useQuery(api.loops.list) ?? []
  const goals = useQuery(api.goals.list) ?? []
  const loopRoutes = useLoopRoutes()
  const workflows = useQuery(api.automations.list) ?? []
  const zone = useCalendarSettings()?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone

  const unsaved = useRef<Draft>(null)
  unsaved.current ??= search.draft
    ? search.draft
    : search.template
      ? draftOf(
          search.template,
          browserZone,
          search.loop && (loopRoutes.id(search.loop) ?? search.loop)
        )
      : blank
  const initial: Draft = saved
    ? { name: saved.name, trigger: saved.trigger, steps: saved.steps, active: saved.active }
    : unsaved.current
  const form = useForm({ defaultValues: initial })
  const draft = useStore(form.store, (s) => s.values)
  const dirty = stable(draft) !== stable(initial)
  const setSteps = (steps: Step[]) => form.setFieldValue("steps", steps)

  const runs = useQuery(api.automations.runs, saved ? { automationId: saved._id } : "skip")
  const runRoutes = routeIds(
    runs ?? [],
    (r) => r._id,
    (r) => dateText(r.startedAt)
  )
  const choices = useQuery(api.automations.choices, saved ? { automationId: saved._id } : "skip")
  const history = search.tab === "history" && saved
  const run = history
    ? (runs?.find((r) => r._id === runRoutes.id(search.run ?? "")) ?? runs?.[0])
    : undefined
  const statuses: Record<string, StepStatus> = Object.fromEntries(
    (run?.log ?? []).map((e) => [e.at, e.status])
  )

  const [status, act] = useActionState(
    async (_: string | undefined, action: "save" | "run" | "stop" | "delete") => {
      try {
        if (action === "stop" && run) await stopRun({ runId: run._id })
        if (action === "delete" && saved) {
          if (!window.confirm(`Delete “${saved.name}” and its history? Runs still going stop.`))
            return undefined
          const removing = remove_({ id: saved._id })
          void navigate({ to: "/workflows" })
          await removing
        }
        if (action === "run" && saved) {
          await runNow({ id: saved._id })
          // With no run named, History opens the newest, which is this one.
          write({ tab: "history", run: undefined, step: undefined })
        }
        if (action === "save") {
          // Saved as the server keeps it, so the page doesn't look unsaved afterwards.
          const next = { ...draft, name: draft.name.trim() }
          const problem = problemOf(next.name, next.trigger, next.steps)
          if (problem) return problem
          const id = await save({ ...(saved && { id: saved._id }), ...next })
          form.reset(next)
          if (!saved) {
            // The new one isn't in the list here yet.
            const withNew = [
              ...workflows.map((w) => ({ id: w._id, name: w.name })),
              { id, name: next.name },
            ]
            const text = routeIds(
              withNew,
              (w) => w.id,
              (w) => w.name
            ).text(id)
            void navigate({ to: "/workflows/$id", params: { id: text }, replace: true })
          }
        }
        return undefined
      } catch (cause) {
        return messageOf(cause)
      }
    },
    undefined
  )

  const onInsert = (slot: Slot, kind: InsertKind) => {
    const steps = draft.steps
    if (kind === "parallel" || kind === "decide") {
      setSteps(branchAt(steps, slot.index, kind, blocks.notify.make()))
      // Select it, so the panel never shows a step that just moved down.
      return write({ step: String(slot.index) })
    }
    setSteps(insert(steps, slot, blocks[kind].make()))
    const at =
      slot.split === undefined ? String(slot.index) : `${slot.split}.${slot.path}.${slot.index}`
    write({ step: at })
  }
  const nameOf = (id: string) =>
    applications.find((a) => a._id === id)?.company ??
    loops.find((l) => l._id === id)?.name ??
    goals.find((g) => g._id === id)?.name
  const shown = run ? run.steps : draft.steps

  // The left panel: name, on/off, and the blocks (or, in History, the runs). A sheet
  // on small screens, where there's no room beside the canvas.
  const side = (
    <>
      <div className="grid gap-3 border-b p-3">
        <label className="grid gap-1.5">
          <span className="text-sm font-medium">Name</span>
          <Input value={draft.name} onChange={(e) => form.setFieldValue("name", e.target.value)} />
        </label>
        <label className="flex items-center justify-between gap-2 text-[13px]">
          On
          <Switch
            checked={draft.active}
            onCheckedChange={(active) => form.setFieldValue("active", active)}
          />
        </label>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="p-3">
          {history && saved ? (
            <RunList automationId={saved._id} selected={run?._id} />
          ) : (
            <div className="flex flex-col gap-1">
              <p className="text-muted-foreground mb-1 px-1 text-xs">
                Drag a block onto a +, or click to add it at the end.
              </p>
              {[
                ...blockKinds.map((kind) => ({ kind, ...blocks[kind] })),
                { kind: "parallel" as const, ...branches.parallel },
                { kind: "decide" as const, ...branches.decide },
              ].map((b) => (
                <button
                  key={b.kind}
                  type="button"
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData("text/workflow-block", b.kind)}
                  onClick={() => onInsert({ index: draft.steps.length }, b.kind)}
                  className="hover:bg-accent/50 flex items-center gap-2.5 rounded-md border px-2.5 py-2 text-start transition-colors"
                >
                  <HugeiconsIcon icon={b.icon} className="text-muted-foreground size-4 shrink-0" />
                  <span className="flex min-w-0 flex-col">
                    <span className="text-[13px] font-medium">{b.label}</span>
                    <span className="text-muted-foreground truncate text-xs">{b.hint}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </ScrollArea>
    </>
  )

  return (
    <div className="flex h-svh flex-col md:h-[calc(100svh-1rem)]">
      <PageHeader
        crumbs={[{ label: "Workflows", to: "/workflows" }, { label: draft.name || "Untitled" }]}
        actions={
          <div className="flex items-center gap-2">
            {status && <span className="text-destructive max-w-72 truncate text-xs">{status}</span>}
            {history && run?.status === "running" && (
              <Button size="sm" variant="ghost" onClick={() => startTransition(() => act("stop"))}>
                Stop run
              </Button>
            )}
            {saved && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => startTransition(() => act("delete"))}
              >
                Delete
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              disabled={!saved || dirty}
              title={dirty ? "Save first; a run uses the saved steps." : undefined}
              onClick={() => startTransition(() => act("run"))}
            >
              Run now
            </Button>
            <Button
              size="sm"
              disabled={saved && !dirty}
              onClick={() => startTransition(() => act("save"))}
            >
              Save
            </Button>
          </div>
        }
      />
      <div className="relative flex min-h-0 flex-1">
        <aside className="hidden w-60 shrink-0 flex-col border-e md:flex">{side}</aside>
        <div className="relative min-w-0 flex-1">
          <Sheet>
            <SheetTrigger
              render={
                <Button
                  size="sm"
                  variant="outline"
                  className="bg-card absolute right-3 top-3 z-10 md:hidden"
                />
              }
            >
              {history ? "Runs" : "Blocks"}
            </SheetTrigger>
            <SheetPopup side="left" className="w-72">
              <div className="flex min-h-0 flex-1 flex-col">{side}</div>
            </SheetPopup>
          </Sheet>
          {saved && (
            <ToggleGroup
              size="sm"
              variant="outline"
              aria-label="Build or history"
              className="bg-card absolute top-3 left-3 z-10"
              value={[history ? "history" : "build"]}
              onValueChange={(v) =>
                v[0] && write({ tab: v[0] === "history" ? "history" : undefined, step: undefined })
              }
            >
              <ToggleGroupItem value="build">Build</ToggleGroupItem>
              <ToggleGroupItem value="history">History</ToggleGroupItem>
            </ToggleGroup>
          )}
          <Canvas
            trigger={draft.trigger}
            steps={shown}
            nameOf={nameOf}
            choices={choices}
            selected={at}
            editable={!history}
            statuses={statuses}
            onSelect={(at) => write({ step: at })}
            onRemove={(at) => {
              setSteps(remove(draft.steps, at))
              write({ step: undefined })
            }}
            onInsert={onInsert}
          />
        </div>
        {at && (
          <aside className="bg-background w-80 shrink-0 border-s max-md:absolute max-md:inset-y-0 max-md:end-0 max-md:z-20 max-md:w-full">
            <ScrollArea className="h-full">
              <div className="grid gap-3 p-4">
                <Button
                  size="xs"
                  variant="ghost"
                  className="justify-self-end"
                  onClick={() => write({ step: undefined })}
                >
                  Close
                </Button>
                {history && run ? (
                  <LogEntry run={run} at={at} />
                ) : (
                  <StepSettings
                    at={at}
                    trigger={draft.trigger}
                    steps={draft.steps}
                    zone={zone}
                    applications={applications}
                    loops={loops}
                    onTrigger={(trigger) => form.setFieldValue("trigger", trigger)}
                    onSteps={setSteps}
                    onDone={() => write({ step: undefined })}
                  />
                )}
              </div>
            </ScrollArea>
          </aside>
        )}
      </div>
    </div>
  )
}

/** The builder for one workflow, or a new one when `id` is "new". */
export const WorkflowBuilder = ({ id }: { id: string }) => {
  const list = useQuery(api.automations.list)
  // A template can name a loop, and the first draft is made once.
  const loops = useQuery(api.loops.list)
  if (list === undefined || loops === undefined) return <div className="h-svh" />
  const saved = list.find((a) => a._id === id)
  if (id !== "new" && !saved)
    return (
      <div className="flex h-svh flex-col">
        <PageHeader crumbs={[{ label: "Workflows", to: "/workflows" }, { label: "Not found" }]} />
        <p className="text-muted-foreground p-6 text-sm">That workflow is gone.</p>
      </div>
    )
  return <Editor key={saved?._id ?? "new"} saved={saved} />
}
