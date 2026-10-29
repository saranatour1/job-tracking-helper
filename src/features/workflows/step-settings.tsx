import type { Doc } from "@convex/_generated/dataModel"
import type { Block, Step, Trigger } from "@convex/api/features/automations/validators"
import { limits, stepAt } from "@convex/api/features/automations/validators"
import { Delete02Icon, PlusSignIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { ZonePick } from "@/features/calendar/settings"

import { blocks, placeholders } from "./blocks"
import { remove, update } from "./tree"

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="grid gap-1.5">
    <Label>{label}</Label>
    {children}
  </div>
)

// Placeholders as buttons: one click adds it to the end of the text.
const Tokens = ({ names, onPick }: { names: string[]; onPick: (name: string) => void }) => (
  <div className="flex flex-wrap gap-1">
    {names.map((name) => (
      <Button key={name} type="button" size="xs" variant="outline" onClick={() => onPick(name)}>
        {name}
      </Button>
    ))}
  </div>
)

const Pick = ({
  label,
  value,
  items,
  onChange,
}: {
  label: string
  value: string | null
  items: { value: string; label: string }[]
  onChange: (value: string) => void
}) => (
  <Select value={value} items={items} onValueChange={(v) => v !== null && onChange(String(v))}>
    <SelectTrigger aria-label={label}>
      <SelectValue placeholder={label} />
    </SelectTrigger>
    <SelectPopup>
      {items.map((o) => (
        <SelectItem key={o.value} value={o.value}>
          {o.label}
        </SelectItem>
      ))}
    </SelectPopup>
  </Select>
)

const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

const TriggerSettings = ({
  trigger,
  zone,
  onChange,
}: {
  trigger: Trigger
  zone: string
  onChange: (trigger: Trigger) => void
}) => (
  <div className="grid gap-4">
    <Field label="Starts">
      <ToggleGroup
        size="sm"
        variant="outline"
        aria-label="Starts"
        className="*:flex-1"
        value={[trigger.kind]}
        onValueChange={(v) =>
          v[0] === "manual"
            ? onChange({ kind: "manual" })
            : v[0] === "schedule" &&
              onChange({ kind: "schedule", at: "09:00", days: [1, 2, 3, 4, 5], timeZone: zone })
        }
      >
        <ToggleGroupItem value="manual">When I run it</ToggleGroupItem>
        <ToggleGroupItem value="schedule">On a schedule</ToggleGroupItem>
      </ToggleGroup>
    </Field>
    {trigger.kind === "schedule" && (
      <>
        <Field label="At">
          <Input
            type="time"
            value={trigger.at}
            onChange={(e) => onChange({ ...trigger, at: e.target.value })}
          />
        </Field>
        <Field label="On">
          <ToggleGroup
            multiple
            size="sm"
            variant="outline"
            aria-label="Days"
            className="flex-wrap"
            value={trigger.days.map(String)}
            onValueChange={(v) => onChange({ ...trigger, days: (v as string[]).map(Number) })}
          >
            {weekdays.map((name, d) => (
              <ToggleGroupItem key={name} value={String(d)}>
                {name}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </Field>
        <Field label="Time zone">
          <ZonePick
            label="Time zone"
            value={trigger.timeZone}
            options={Intl.supportedValuesOf("timeZone")}
            onChange={(timeZone) => onChange({ ...trigger, timeZone })}
          />
        </Field>
      </>
    )}
  </div>
)

const BlockSettings = ({
  block,
  applications,
  onChange,
}: {
  block: Block
  applications: Doc<"applications">[]
  onChange: (block: Block) => void
}) => {
  switch (block.kind) {
    case "notify":
      return (
        <Field label="Message">
          <Textarea
            rows={4}
            maxLength={limits.message}
            value={block.message}
            onChange={(e) => onChange({ ...block, message: e.target.value })}
          />
          <Tokens
            names={placeholders.notify}
            onPick={(name) => onChange({ ...block, message: `${block.message} ${name}`.trim() })}
          />
        </Field>
      )
    case "addNote":
      return (
        <div className="grid gap-4">
          <Field label="Application">
            <Pick
              label="Pick an application"
              value={block.applicationId || null}
              items={applications.map((a) => ({ value: a._id, label: `${a.company} · ${a.role}` }))}
              onChange={(id) =>
                onChange({ ...block, applicationId: id as Doc<"applications">["_id"] })
              }
            />
          </Field>
          <Field label="Note">
            <Textarea
              rows={4}
              maxLength={limits.note}
              value={block.text}
              onChange={(e) => onChange({ ...block, text: e.target.value })}
            />
            <Tokens
              names={placeholders.addNote}
              onPick={(name) => onChange({ ...block, text: `${block.text} ${name}`.trim() })}
            />
          </Field>
        </div>
      )
    case "wait": {
      // Days, hours and minutes side by side, so nothing changes unit as you type.
      const parts = [
        ["days", Math.floor(block.minutes / 1440), 1440, 30],
        ["hours", Math.floor((block.minutes % 1440) / 60), 60, 23],
        ["minutes", block.minutes % 60, 1, 59],
      ] as const
      return (
        <Field label="Wait for">
          <div className="grid grid-cols-3 gap-2">
            {parts.map(([name, value, size, max]) => (
              <label key={name} className="grid gap-1">
                <Input
                  type="number"
                  min={0}
                  max={max}
                  value={value}
                  onChange={(e) => {
                    const next = Math.min(max, Math.max(0, Math.floor(Number(e.target.value) || 0)))
                    onChange({ ...block, minutes: block.minutes + (next - value) * size })
                  }}
                />
                <span className="text-muted-foreground text-xs">{name}</span>
              </label>
            ))}
          </div>
        </Field>
      )
    }
  }
}

const SplitSettings = ({
  step,
  onChange,
}: {
  step: Extract<Step, { kind: "parallel" }>
  onChange: (step: Step) => void
}) => (
  <div className="grid gap-3">
    <p className="text-muted-foreground text-xs">
      Each path runs at the same time, and the workflow goes on once every path is done.
    </p>
    {step.paths.map((path, p) => (
      <div key={p} className="flex items-center gap-2">
        <Input
          aria-label={`Path ${p + 1} name`}
          maxLength={limits.label}
          value={path.label}
          onChange={(e) =>
            onChange({
              ...step,
              paths: step.paths.map((q, k) => (k === p ? { ...q, label: e.target.value } : q)),
            })
          }
        />
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label={`Remove ${path.label}`}
          disabled={step.paths.length <= 2}
          onClick={() => onChange({ ...step, paths: step.paths.filter((_, k) => k !== p) })}
        >
          <HugeiconsIcon icon={Delete02Icon} />
        </Button>
      </div>
    ))}
    {step.paths.length < limits.paths && (
      <Button
        size="sm"
        variant="outline"
        className="justify-self-start"
        onClick={() =>
          onChange({
            ...step,
            paths: [
              ...step.paths,
              { label: `Path ${step.paths.length + 1}`, steps: [blocks.notify.make()] },
            ],
          })
        }
      >
        <HugeiconsIcon icon={PlusSignIcon} />
        Add a path
      </Button>
    )}
  </div>
)

/** The panel beside the canvas: the selected step's settings. */
export const StepSettings = ({
  at,
  trigger,
  steps,
  zone,
  applications,
  onTrigger,
  onSteps,
  onDone,
}: {
  at: string
  trigger: Trigger
  steps: Step[]
  zone: string
  applications: Doc<"applications">[]
  onTrigger: (trigger: Trigger) => void
  onSteps: (steps: Step[]) => void
  onDone: () => void
}) => {
  if (at === "trigger")
    return (
      <section className="grid gap-4">
        <h2 className="font-heading text-sm font-medium">Trigger</h2>
        <TriggerSettings trigger={trigger} zone={zone} onChange={onTrigger} />
      </section>
    )
  const step = stepAt(steps, at)
  if (!step) return null
  const title = step.kind === "parallel" ? "Split" : blocks[step.kind].label
  return (
    <section className="grid gap-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-heading text-sm font-medium">{title}</h2>
        <Button
          size="xs"
          variant="ghost"
          onClick={() => {
            onSteps(remove(steps, at))
            onDone()
          }}
        >
          <HugeiconsIcon icon={Delete02Icon} />
          Remove
        </Button>
      </div>
      {step.kind === "parallel" ? (
        <SplitSettings step={step} onChange={(next) => onSteps(update(steps, at, next))} />
      ) : (
        <BlockSettings
          block={step}
          applications={applications}
          onChange={(next) => onSteps(update(steps, at, next))}
        />
      )}
    </section>
  )
}
