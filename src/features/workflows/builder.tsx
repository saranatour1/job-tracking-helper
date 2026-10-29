import { api } from "@convex/_generated/api"
import type { Doc, Id } from "@convex/_generated/dataModel"
import {
  blocksOf,
  problemOf,
  type Step,
  type Trigger,
} from "@convex/api/features/automations/validators"
import { HugeiconsIcon } from "@hugeicons/react"
import { useForm, useStore } from "@tanstack/react-form"
import { useNavigate, useSearch } from "@tanstack/react-router"
import { useMutation } from "convex/react"
import { useQuery } from "convex-helpers/react/cache/hooks"
import { startTransition, useActionState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Switch } from "@/components/ui/switch"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { messageOf } from "@/features/account/settings"
import { useCalendarSettings } from "@/features/calendar/saved"
import { PageHeader } from "@/features/shell/page-header"
import { cn } from "@/lib/utils"

import { blockKinds, blocks, split } from "./blocks"
import { Canvas, type InsertKind, type StepStatus } from "./canvas"
import { StepSettings } from "./step-settings"
import { insert, remove, type Slot, splitAt } from "./tree"

export type WorkflowSearch = { step?: string; tab?: "history"; run?: string }
export const workflowSearch = (search: Record<string, unknown>): WorkflowSearch => ({
  step: typeof search.step === "string" ? search.step : undefined,
  tab: search.tab === "history" ? "history" : undefined,
  run: typeof search.run === "string" ? search.run : undefined,
})

type Draft = { name: string; trigger: Trigger; steps: Step[]; active: boolean }
const blank: Draft = {
  name: "New workflow",
  trigger: { kind: "manual" },
  steps: [blocks.notify.make()],
  active: true,
}

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

// Runs on the left in History: how many ended which way, then the latest ones.
const RunList = ({
  automationId,
  selected,
}: {
  automationId: Id<"automations">
  selected?: string
}) => {
  const runs = useQuery(api.automations.runs, { automationId }) ?? []
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
                void navigate({ search: (s) => ({ ...s, run: run._id }), replace: true })
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
                  {run.trigger === "schedule" ? "Scheduled" : "Run now"} · {run.status}
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
    void navigate({ search: (s) => ({ ...s, ...patch }), replace: true })
  const save = useMutation(api.automations.save)
  const runNow = useMutation(api.automations.runNow)
  const stopRun = useMutation(api.automations.stopRun)
  const applications = useQuery(api.applications.list) ?? []
  const zone = useCalendarSettings()?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone

  const initial: Draft = saved
    ? { name: saved.name, trigger: saved.trigger, steps: saved.steps, active: saved.active }
    : blank
  const form = useForm({ defaultValues: initial })
  const draft = useStore(form.store, (s) => s.values)
  const dirty = stable(draft) !== stable(initial)
  const setSteps = (steps: Step[]) => form.setFieldValue("steps", steps)

  const runs = useQuery(api.automations.runs, saved ? { automationId: saved._id } : "skip")
  const history = search.tab === "history" && saved
  const run = history ? (runs?.find((r) => r._id === search.run) ?? runs?.[0]) : undefined
  const statuses: Record<string, StepStatus> = Object.fromEntries(
    (run?.log ?? []).map((e) => [e.at, e.status])
  )

  const [status, act] = useActionState(
    async (_: string | undefined, action: "save" | "run" | "stop") => {
      try {
        if (action === "stop" && run) await stopRun({ runId: run._id })
        if (action === "run" && saved) {
          const runId = await runNow({ id: saved._id })
          write({ tab: "history", run: runId, step: undefined })
        }
        if (action === "save") {
          const problem =
            problemOf(draft.name, draft.trigger, draft.steps) ??
            (blocksOf(draft.steps).some((b) => b.kind === "addNote" && !b.applicationId)
              ? "Pick an application for each note."
              : undefined)
          if (problem) return problem
          const id = await save({ ...(saved && { id: saved._id }), ...draft })
          form.reset(draft)
          if (!saved) void navigate({ to: "/workflows/$id", params: { id }, replace: true })
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
    if (kind === "split") return setSteps(splitAt(steps, slot.index, blocks.notify.make()))
    setSteps(insert(steps, slot, blocks[kind].make()))
    const at =
      slot.split === undefined ? String(slot.index) : `${slot.split}.${slot.path}.${slot.index}`
    write({ step: at })
  }
  const companyOf = (id: string) => applications.find((a) => a._id === id)?.company
  const shown = run ? run.steps : draft.steps

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
      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-60 shrink-0 flex-col border-e md:flex">
          <div className="grid gap-3 border-b p-3">
            <div className="grid gap-1.5">
              <Label htmlFor="workflow-name">Name</Label>
              <Input
                id="workflow-name"
                value={draft.name}
                onChange={(e) => form.setFieldValue("name", e.target.value)}
              />
            </div>
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
                    { kind: "split" as const, ...split },
                  ].map((b) => (
                    <button
                      key={b.kind}
                      type="button"
                      draggable
                      onDragStart={(e) => e.dataTransfer.setData("text/workflow-block", b.kind)}
                      onClick={() => onInsert({ index: draft.steps.length }, b.kind)}
                      className="hover:bg-accent/50 flex items-center gap-2.5 rounded-md border px-2.5 py-2 text-start transition-colors"
                    >
                      <HugeiconsIcon
                        icon={b.icon}
                        className="text-muted-foreground size-4 shrink-0"
                      />
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
        </aside>
        <div className="relative min-w-0 flex-1">
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
            companyOf={companyOf}
            selected={search.step}
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
        {search.step && (
          <aside className="w-80 shrink-0 border-s">
            <ScrollArea className="h-full">
              <div className="p-4">
                {history && run ? (
                  <LogEntry run={run} at={search.step} />
                ) : (
                  <StepSettings
                    at={search.step}
                    trigger={draft.trigger}
                    steps={draft.steps}
                    zone={zone}
                    applications={applications}
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
  if (list === undefined) return <div className="h-svh" />
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
