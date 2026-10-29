import type { Doc } from "@convex/_generated/dataModel"
import { statusLabels, statuses } from "@convex/api/features/applications/validators"
import type { Block, Branch, Step, Trigger } from "@convex/api/features/automations/validators"
import { limits, stepAt, triggerHasApplication } from "@convex/api/features/automations/validators"
import { Delete02Icon, PlusSignIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { ZonePick } from "@/features/calendar/settings"

import { blocks, branches, mailKindLabels, placeholdersFor, triggerKinds } from "./blocks"
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

// A new trigger of each kind, as it starts out.
const freshTrigger = (kind: Trigger["kind"], zone: string): Trigger => {
  switch (kind) {
    case "schedule":
      return { kind, at: "09:00", days: [1, 2, 3, 4, 5], timeZone: zone }
    case "mail":
      return { kind, kinds: [] }
    case "status":
      return { kind, to: [] }
    default:
      return { kind }
  }
}

// Picks some of a list; none picked means any.
const Some = <T extends string>({
  label,
  value,
  labels,
  onChange,
}: {
  label: string
  value: T[]
  labels: Record<T, string>
  onChange: (value: T[]) => void
}) => (
  <Field label={label}>
    <ToggleGroup
      multiple
      size="sm"
      variant="outline"
      aria-label={label}
      className="flex-wrap"
      value={value}
      onValueChange={(v) => onChange(v as T[])}
    >
      {(Object.keys(labels) as T[]).map((key) => (
        <ToggleGroupItem key={key} value={key}>
          {labels[key]}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
    <p className="text-muted-foreground text-xs">None picked: any.</p>
  </Field>
)

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
    <Field label="Starts when">
      <Pick
        label="Starts when"
        value={trigger.kind}
        items={(Object.keys(triggerKinds) as Trigger["kind"][]).map((kind) => ({
          value: kind,
          label: triggerKinds[kind],
        }))}
        onChange={(kind) =>
          kind !== trigger.kind && onChange(freshTrigger(kind as Trigger["kind"], zone))
        }
      />
    </Field>
    {trigger.kind === "mail" && (
      <Some
        label="Kinds of email"
        value={trigger.kinds}
        labels={mailKindLabels}
        onChange={(kinds) => onChange({ ...trigger, kinds })}
      />
    )}
    {trigger.kind === "status" && (
      <Some
        label="Moves to"
        value={trigger.to}
        labels={statusLabels}
        onChange={(to) => onChange({ ...trigger, to })}
      />
    )}
    {trigger.kind === "booking" && (
      <p className="text-muted-foreground text-xs">
        Runs when someone books time on any of your booking pages.
      </p>
    )}
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

// Which application a step acts on: one you pick, or the one the trigger is about.
const ApplicationPick = ({
  value,
  trigger,
  applications,
  onChange,
}: {
  value: Doc<"applications">["_id"] | undefined
  trigger: Trigger
  applications: Doc<"applications">[]
  onChange: (id: Doc<"applications">["_id"] | undefined) => void
}) => {
  const fromTrigger = triggerHasApplication(trigger)
  return (
    <Field label="Application">
      <Pick
        label="Pick an application"
        value={value ?? (fromTrigger ? "trigger" : null)}
        items={[
          ...(fromTrigger ? [{ value: "trigger", label: "The one the trigger is about" }] : []),
          ...applications.map((a) => ({ value: a._id, label: `${a.company} · ${a.role}` })),
        ]}
        onChange={(id) =>
          onChange(id === "trigger" ? undefined : (id as Doc<"applications">["_id"]))
        }
      />
    </Field>
  )
}

const sends = { inbox: "Inbox", email: "Email", both: "Both" } as const

const BlockSettings = ({
  block,
  trigger,
  steps,
  applications,
  loops,
  onChange,
}: {
  block: Block
  trigger: Trigger
  steps: Step[]
  applications: Doc<"applications">[]
  loops: Doc<"loops">[]
  onChange: (block: Block) => void
}) => {
  switch (block.kind) {
    case "findRoles":
      return (
        <div className="grid gap-4">
          <Field label="Loop">
            <Pick
              label="Pick a loop"
              value={block.loopId || null}
              items={loops.map((l) => ({ value: l._id, label: l.name }))}
              onChange={(loopId) => onChange({ ...block, loopId: loopId as Doc<"loops">["_id"] })}
            />
          </Field>
          <p className="text-muted-foreground text-xs">
            Runs the loop now: it searches, Jev judges what it finds, and fits go on your shortlist.
            Steps after it can name {"{roles.fits}"} and {"{roles.judged}"}. A few a day.
          </p>
        </div>
      )
    case "sendEmail":
      return (
        <div className="grid gap-4">
          <Field label="To">
            <Input
              value={block.to}
              placeholder="name@example.com"
              onChange={(e) => onChange({ ...block, to: e.target.value })}
            />
          </Field>
          <Field label="Subject">
            <Input
              maxLength={limits.subject}
              value={block.subject}
              onChange={(e) => onChange({ ...block, subject: e.target.value })}
            />
          </Field>
          <Field label="Email">
            <Textarea
              rows={6}
              maxLength={limits.emailText}
              value={block.text}
              onChange={(e) => onChange({ ...block, text: e.target.value })}
            />
            <Tokens
              names={placeholdersFor(trigger, steps)}
              onPick={(name) => onChange({ ...block, text: `${block.text} ${name}`.trim() })}
            />
          </Field>
          <p className="text-muted-foreground text-xs">
            Sent as you, from your Cloudflare address, once “Send email” is on under Account. Up to
            20 a day.
          </p>
        </div>
      )
    case "notify":
      return (
        <div className="grid gap-4">
          <Field label="Message">
            <Textarea
              rows={4}
              maxLength={limits.message}
              value={block.message}
              onChange={(e) => onChange({ ...block, message: e.target.value })}
            />
            <Tokens
              names={placeholdersFor(trigger, steps)}
              onPick={(name) => onChange({ ...block, message: `${block.message} ${name}`.trim() })}
            />
          </Field>
          <Field label="Send to">
            <ToggleGroup
              size="sm"
              variant="outline"
              aria-label="Send to"
              className="*:flex-1"
              value={[block.send ?? "inbox"]}
              onValueChange={(v) =>
                v[0] && onChange({ ...block, send: v[0] as keyof typeof sends })
              }
            >
              {(Object.keys(sends) as (keyof typeof sends)[]).map((key) => (
                <ToggleGroupItem key={key} value={key}>
                  {sends[key]}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            {block.send && block.send !== "inbox" && (
              <p className="text-muted-foreground text-xs">
                Sent from your Cloudflare email, once “Send email” is on under Account.
              </p>
            )}
          </Field>
        </div>
      )
    case "addNote":
      return (
        <div className="grid gap-4">
          <ApplicationPick
            value={block.applicationId}
            trigger={trigger}
            applications={applications}
            onChange={(applicationId) => onChange({ ...block, applicationId })}
          />
          <Field label="Note">
            <Textarea
              rows={4}
              maxLength={limits.note}
              value={block.text}
              onChange={(e) => onChange({ ...block, text: e.target.value })}
            />
            <Tokens
              names={placeholdersFor(trigger, steps, true)}
              onPick={(name) => onChange({ ...block, text: `${block.text} ${name}`.trim() })}
            />
          </Field>
        </div>
      )
    case "move":
      return (
        <div className="grid gap-4">
          <ApplicationPick
            value={block.applicationId}
            trigger={trigger}
            applications={applications}
            onChange={(applicationId) => onChange({ ...block, applicationId })}
          />
          <Field label="Move to">
            <Pick
              label="Move to"
              value={block.to}
              items={statuses.map((s) => ({ value: s, label: statusLabels[s] }))}
              onChange={(to) => onChange({ ...block, to: to as typeof block.to })}
            />
          </Field>
        </div>
      )
    case "addEvent":
      return (
        <div className="grid gap-4">
          <Field label="Title">
            <Input
              maxLength={limits.title}
              value={block.title}
              onChange={(e) => onChange({ ...block, title: e.target.value })}
            />
            <Tokens
              names={placeholdersFor(trigger, steps)}
              onPick={(name) => onChange({ ...block, title: `${block.title} ${name}`.trim() })}
            />
          </Field>
          <div className="grid grid-cols-3 gap-2">
            <label className="grid gap-1">
              <Input
                type="number"
                min={0}
                max={limits.eventDays}
                value={block.inDays}
                onChange={(e) =>
                  onChange({
                    ...block,
                    inDays: Math.min(
                      limits.eventDays,
                      Math.max(0, Math.floor(Number(e.target.value) || 0))
                    ),
                  })
                }
              />
              <span className="text-muted-foreground text-xs">days later</span>
            </label>
            <label className="grid gap-1">
              <Input
                type="time"
                value={block.at}
                onChange={(e) => onChange({ ...block, at: e.target.value })}
              />
              <span className="text-muted-foreground text-xs">at</span>
            </label>
            <label className="grid gap-1">
              <Input
                type="number"
                min={5}
                max={limits.eventMinutes}
                step={5}
                value={block.minutes}
                onChange={(e) =>
                  onChange({
                    ...block,
                    minutes: Math.min(
                      limits.eventMinutes,
                      Math.max(5, Math.floor(Number(e.target.value) || 0))
                    ),
                  })
                }
              />
              <span className="text-muted-foreground text-xs">minutes long</span>
            </label>
          </div>
          <p className="text-muted-foreground text-xs">In your Calendar's time zone.</p>
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

const BranchSettings = ({
  step,
  trigger,
  steps,
  onChange,
}: {
  step: Branch
  trigger: Trigger
  steps: Step[]
  onChange: (step: Step) => void
}) => (
  <div className="grid gap-3">
    {step.kind === "decide" ? (
      <>
        <Field label="Question">
          <Textarea
            rows={3}
            maxLength={limits.question}
            value={step.question}
            onChange={(e) => onChange({ ...step, question: e.target.value })}
          />
          <Tokens
            names={placeholdersFor(trigger, steps)}
            onPick={(name) => onChange({ ...step, question: `${step.question} ${name}`.trim() })}
          />
        </Field>
        <p className="text-muted-foreground text-xs">
          Jev reads what the run knows, like the email or the application, and picks one answer.
          Only that path runs; a path with no steps does nothing.
        </p>
        <Label>Answers</Label>
      </>
    ) : (
      <p className="text-muted-foreground text-xs">
        Each path runs at the same time, and the workflow goes on once every path is done.
      </p>
    )}
    {step.paths.map((path, p) => (
      <div key={p} className="flex items-center gap-2">
        <Input
          aria-label={step.kind === "decide" ? `Answer ${p + 1}` : `Path ${p + 1} name`}
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
              step.kind === "decide"
                ? { label: `Answer ${step.paths.length + 1}`, steps: [] }
                : { label: `Path ${step.paths.length + 1}`, steps: [blocks.notify.make()] },
            ],
          })
        }
      >
        <HugeiconsIcon icon={PlusSignIcon} />
        {step.kind === "decide" ? "Add an answer" : "Add a path"}
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
  loops,
  onTrigger,
  onSteps,
  onDone,
}: {
  at: string
  trigger: Trigger
  steps: Step[]
  zone: string
  applications: Doc<"applications">[]
  loops: Doc<"loops">[]
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
  const title =
    step.kind === "parallel" || step.kind === "decide"
      ? branches[step.kind].short
      : blocks[step.kind].label
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
      {step.kind === "parallel" || step.kind === "decide" ? (
        <BranchSettings
          step={step}
          trigger={trigger}
          steps={steps}
          onChange={(next) => onSteps(update(steps, at, next))}
        />
      ) : (
        <BlockSettings
          block={step}
          trigger={trigger}
          steps={steps}
          applications={applications}
          loops={loops}
          onChange={(next) => onSteps(update(steps, at, next))}
        />
      )}
    </section>
  )
}
