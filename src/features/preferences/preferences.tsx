import { api } from "@convex/_generated/api"
import type { Id } from "@convex/_generated/dataModel"
import {
  emptyPreferences,
  maxResumeBytes,
  Preferences as PreferencesType,
  PreferencesDraft,
  PrefilledSections,
  resumeTypes,
  workModes,
} from "@convex/api/features/preferences/validators"
import {
  ArrowRight01Icon,
  Cancel01Icon,
  Copy01Icon,
  PlusSignIcon,
  SparklesIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useForm, useStore } from "@tanstack/react-form"
import { useNavigate } from "@tanstack/react-router"
import { type } from "arktype"
import { useMutation, useQuery } from "convex/react"
import { ConvexError } from "convex/values"
import { useRef, useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsList, TabsPanel, TabsTab } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { addChip, addTile, chip, PageIntro, pageBody, Tile, tileGrid } from "./page-body"
import { PageHeader } from "@/features/shell/page-header"
import { cn } from "@/lib/utils"

import { IdentityBlocks } from "./identity-blocks"
import { assistantPrompt, parseReply } from "./prompt"
import { fillEmpty, type Section as FieldSection, suggestedSections } from "./prefilled"

type Values = typeof PreferencesType.inferIn
type Draft = typeof PreferencesDraft.infer

const messageOf = (error: unknown) =>
  error instanceof ConvexError && typeof error.data === "string"
    ? error.data
    : "Something went wrong. Try again."

const workModeLabels: Record<(typeof workModes)[number], string> = {
  any: "Open to all",
  remote: "Remote",
  hybrid: "Hybrid",
  onsite: "On-site",
}

const questions: { key: keyof Values["answers"]; label: string }[] = [
  { key: "offer", label: "What would make you say yes to an offer on the spot?" },
  { key: "leave", label: "What would make you leave a job in the first six months?" },
  { key: "goodWeek", label: "What does a good week at work look like?" },
  { key: "pay", label: "What's the lowest pay you'd accept, and in which currency?" },
  { key: "visa", label: "Do you need a visa or work permit anywhere?" },
  { key: "start", label: "When could you start?" },
]

// Short words, added with Enter or a comma, removed with × or Backspace.
const TagInput = ({
  id,
  value,
  onChange,
  placeholder,
}: {
  id: string
  value: string[]
  onChange: (value: string[]) => void
  placeholder: string
}) => {
  const [draft, setDraft] = useState("")
  const add = (words: string[]) => {
    const next = [...value]
    for (const word of words.map((w) => w.trim()).filter(Boolean))
      if (!next.includes(word)) next.push(word)
    onChange(next)
  }
  return (
    <div className="border-input focus-within:border-ring/60 dark:bg-input/32 flex min-h-9 flex-wrap items-center gap-1 rounded-lg border px-1.5 py-1 transition-colors">
      {value.map((tag) => (
        <Badge key={tag} variant="secondary" className="h-6 gap-1 ps-2 pe-1 text-xs sm:h-6">
          {tag}
          <button
            type="button"
            aria-label={`Remove ${tag}`}
            className="hover:bg-foreground/10 rounded-sm"
            onClick={() => onChange(value.filter((t) => t !== tag))}
          >
            <HugeiconsIcon icon={Cancel01Icon} className="size-3" />
          </button>
        </Badge>
      ))}
      <input
        id={id}
        value={draft}
        placeholder={value.length ? "" : placeholder}
        onChange={(e) => {
          const parts = e.target.value.split(",")
          if (parts.length > 1) add(parts.slice(0, -1))
          setDraft(parts.at(-1) ?? "")
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault()
            add([draft])
            setDraft("")
          } else if (e.key === "Backspace" && !draft && value.length) {
            onChange(value.slice(0, -1))
          }
        }}
        onBlur={() => {
          add([draft])
          setDraft("")
        }}
        className="placeholder:text-muted-foreground min-w-32 flex-1 bg-transparent px-1 text-sm outline-none"
      />
    </div>
  )
}

const Section = ({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: React.ReactNode
}) => (
  <div className="flex flex-col gap-6">
    <PageIntro title={title} description={description} />
    <Tile className="gap-4 p-4">{children}</Tile>
  </div>
)

// Copy the prompt, run it in your own assistant, paste the JSON reply back.
const Prefill = ({ onDraft }: { onDraft: (draft: Draft) => number }) => {
  const [reply, setReply] = useState("")
  const [status, setStatus] = useState<{ ok: boolean; text: string }>()
  const [copied, setCopied] = useState(false)
  return (
    <Tile title="Fill this in with your own AI assistant" className="gap-4 p-4">
      <p className="text-muted-foreground text-xs leading-relaxed">
        This prompt is for you to paste into ChatGPT, Claude or any assistant you already use. It
        interviews you and writes your answers in a format this form can read. Nothing leaves this
        page until you paste the reply below, and you can edit every answer before saving.
      </p>
      <ol className="text-muted-foreground grid gap-1 text-xs">
        <li>1. Copy the prompt and paste it into your assistant.</li>
        <li>2. Answer its questions. Paste in notes or a LinkedIn summary if that's quicker.</li>
        <li>3. Paste its final reply here and fill the form.</li>
      </ol>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() =>
            void navigator.clipboard.writeText(assistantPrompt).then(
              () => setCopied(true),
              () => setStatus({ ok: false, text: "Couldn't copy. Open the prompt and copy it." })
            )
          }
        >
          <HugeiconsIcon icon={Copy01Icon} /> {copied ? "Copied" : "Copy prompt"}
        </Button>
        <details className="w-full">
          <summary className="text-muted-foreground cursor-pointer text-xs">
            Show the prompt
          </summary>
          <pre className="bg-background mt-2 max-h-64 overflow-auto rounded-md border p-3 text-[11px] whitespace-pre-wrap">
            {assistantPrompt}
          </pre>
        </details>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="assistant-reply" className="text-xs">
          Your assistant's reply
        </Label>
        <Textarea
          id="assistant-reply"
          placeholder='Paste the reply that starts with "{"'
          value={reply}
          onChange={(e) => {
            setReply(e.target.value)
            setStatus(undefined)
          }}
          className="min-h-20 font-mono text-xs"
        />
        <div className="flex items-center gap-3">
          <Button
            type="button"
            size="sm"
            disabled={!reply.trim()}
            onClick={() => {
              const result = parseReply(reply)
              if (!result.draft) return setStatus({ ok: false, text: result.error })
              const count = onDraft(result.draft)
              setStatus({
                ok: true,
                text: `Filled ${count} ${count === 1 ? "answer" : "answers"}. Check them below, then save.`,
              })
            }}
          >
            Fill the form
          </Button>
          {status && (
            <p
              role={status.ok ? "status" : "alert"}
              className={status.ok ? "text-xs" : "text-destructive text-xs"}
            >
              {status.text}
            </p>
          )}
        </div>
      </div>
    </Tile>
  )
}

const ResumeStep = ({ resume }: { resume: { name: string; url: string | null } | null }) => {
  const generateUploadUrl = useMutation(api.users.generateUploadUrl)
  const setResume = useMutation(api.preferences.setResume)
  const [error, setError] = useState<string>()

  const upload = async (file: File) => {
    // The server checks too; this keeps an obviously wrong file out of storage.
    if (!resumeTypes.includes(file.type)) return setError("Upload a PDF, Word or plain text file.")
    if (file.size > maxResumeBytes) return setError("Resumes must be 10 MB or smaller.")
    const response = await fetch(await generateUploadUrl(), {
      method: "POST",
      headers: { "Content-Type": file.type },
      body: file,
    })
    const { storageId } = (await response.json()) as { storageId: Id<"_storage"> }
    await setResume({ resumeId: storageId, name: file.name.slice(0, 200) })
  }

  return (
    <Section
      title="Resume, if you have one"
      description="Optional. We won't read it, score it or rewrite it."
    >
      <p className="text-muted-foreground text-xs leading-relaxed">
        It's kept only so you can attach it when an application form asks for one. Tailoring a
        resume to a role isn't available yet. You can keep one file at a time, and uploading a new
        one replaces it.
      </p>
      {resume ? (
        <div className="flex items-center gap-3 text-sm">
          {resume.url ? (
            <a href={resume.url} target="_blank" rel="noreferrer" className="truncate underline">
              {resume.name}
            </a>
          ) : (
            <span className="truncate">{resume.name}</span>
          )}
          <Button type="button" size="xs" variant="outline" onClick={() => void setResume({})}>
            Remove
          </Button>
        </div>
      ) : null}
      <div className="grid gap-1.5">
        <Label htmlFor="resume" className="text-xs">
          {resume ? "Replace with another file" : "Upload a file"}
        </Label>
        <Input
          id="resume"
          type="file"
          accept=".pdf,.doc,.docx,.txt"
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ""
            if (file) {
              setError(undefined)
              upload(file).catch((cause: unknown) => setError(messageOf(cause)))
            }
          }}
        />
        {error && (
          <p role="alert" className="text-destructive text-xs">
            {error}
          </p>
        )}
      </div>
    </Section>
  )
}

type Resume = { name: string; url: string | null } | null

const errors = (messages: ({ message?: string } | undefined)[]) =>
  messages.map((error) => (
    <p key={error?.message} className="text-destructive text-xs">
      {error?.message}
    </p>
  ))

const PrefilledShape = type({ sections: PrefilledSections })

// Reads as plain text until hovered or focused, like a settings row.
const soft =
  "w-full rounded-md text-sm ring-ring/40 transition-colors hover:bg-accent/40 has-focus-visible:bg-accent/40 has-focus-visible:ring-1 has-aria-invalid:ring-1 has-aria-invalid:ring-destructive/60"

// A textarea that starts one line tall and grows with its text.
const oneLine =
  "[&_textarea]:min-h-0 [&_textarea]:resize-none [&_textarea]:px-2.5 [&_textarea]:py-1"

// The first problem anywhere in a form, for the status line next to Save.
const firstError = (
  fieldMeta: Record<string, { errors: ({ message?: string } | undefined)[] } | undefined>
) => Object.values(fieldMeta).flatMap((m) => m?.errors ?? [])[0]?.message

// Fields application forms ask for, in sections, with what to put in each, ready to copy.
// Saved on its own, so it never overwrites the answers in the other tabs.
const Prefilled = ({
  saved,
  suggestions,
}: {
  saved: FieldSection[] | null
  suggestions: FieldSection[]
}) => {
  const savePrefilled = useMutation(api.preferences.savePrefilled)
  const [status, setStatus] = useState<string>()
  const [copied, setCopied] = useState<string>()
  const [defaults] = useState(() => ({ sections: saved ?? suggestions }))
  const form = useForm({
    defaultValues: defaults,
    validators: { onSubmit: PrefilledShape },
    // Re-check on every save; otherwise one failed save blocks the next even once fixed.
    canSubmitWhenInvalid: true,
    onSubmit: async ({ value }) => {
      setStatus(undefined)
      await savePrefilled(value).then(
        () => setStatus("Saved."),
        (error: unknown) => setStatus(messageOf(error))
      )
    },
    onSubmitInvalid: ({ formApi }) =>
      setStatus(firstError(formApi.state.fieldMeta) ?? "Some fields need fixing."),
  })
  // Array fields re-render only when items come or go; rows read titles and values live.
  const live = useStore(form.store, (st) => st.values.sections)

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <ScrollArea className="min-h-0 flex-1">
        <div className={cn(pageBody, "animate-in fade-in duration-300 motion-reduce:animate-none")}>
          <PageIntro
            title="Prefilled"
            description={
              <>
                What to put in the fields application forms ask for, ready to copy. Rename, add or
                remove any field or section. Nothing gets filled in anywhere without you.
                {!saved && " Suggested from your account and answers until you save."}
              </>
            }
          >
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                const result = fillEmpty(form.state.values.sections, suggestions)
                form.setFieldValue("sections", result.sections)
                setStatus(
                  result.filled
                    ? `Filled ${result.filled} from your answers. Check them, then save.`
                    : "Nothing new to fill from your answers."
                )
              }}
            >
              <HugeiconsIcon icon={SparklesIcon} /> Fill empty ones from your answers
            </Button>
          </PageIntro>
          <form.Field name="sections" mode="array">
            {(sections) => (
              <>
                {/* Bento: every section on one screen; big ones take a full row. */}
                <div className={tileGrid}>
                  {live.map((section, si) => (
                    <Tile
                      key={si}
                      className={cn(isWide(section.fields) && "md:col-span-2")}
                      title={
                        <form.Field name={`sections[${si}].title`}>
                          {(f) => (
                            <div className="me-auto grid min-w-0 gap-1">
                              {/* The title is a chip; the dashed chips beside it add things. */}
                              <Input
                                unstyled
                                size="sm"
                                aria-label={`Section ${si + 1} title`}
                                placeholder="Section title"
                                value={f.state.value}
                                onChange={(e) => f.handleChange(e.target.value)}
                                aria-invalid={f.state.meta.errors.length > 0}
                                className={cn(
                                  chip,
                                  "has-focus-visible:ring-ring/40 has-aria-invalid:border-destructive/60 max-w-full p-0 has-focus-visible:ring-1 [&_input]:min-w-24 [&_input]:[field-sizing:content]"
                                )}
                              />
                              {errors(f.state.meta.errors)}
                            </div>
                          )}
                        </form.Field>
                      }
                      actions={
                        <>
                          <form.Field name={`sections[${si}].fields`} mode="array">
                            {(fields) => (
                              <button
                                type="button"
                                disabled={fields.state.value.length >= 50}
                                onClick={() => fields.pushValue({ label: "", value: "" })}
                                className={addChip}
                              >
                                <HugeiconsIcon icon={PlusSignIcon} className="size-3.5" /> Field
                              </button>
                            )}
                          </form.Field>
                          <Button
                            type="button"
                            size="icon-sm"
                            variant="ghost"
                            aria-label={`Remove the ${section.title.trim() || "untitled"} section`}
                            onClick={() => sections.removeValue(si)}
                          >
                            <HugeiconsIcon icon={Cancel01Icon} />
                          </Button>
                        </>
                      }
                    >
                      <form.Field name={`sections[${si}].fields`} mode="array">
                        {(fields) => (
                          <>
                            <div className="flex flex-col">
                              {section.fields.map((row, fi) => (
                                <div
                                  key={fi}
                                  className="group grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)_auto] items-start gap-1"
                                >
                                  <form.Field name={`sections[${si}].fields[${fi}].label`}>
                                    {(f) => (
                                      <div className="grid gap-1">
                                        {/* Wraps like the value, so long questions stay readable. */}
                                        <Textarea
                                          unstyled
                                          aria-label={`${section.title || "Section"} label ${fi + 1}`}
                                          placeholder="Label, e.g. LinkedIn"
                                          value={f.state.value}
                                          onChange={(e) => f.handleChange(e.target.value)}
                                          onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
                                          aria-invalid={f.state.meta.errors.length > 0}
                                          className={cn(soft, "font-medium", oneLine)}
                                        />
                                        {errors(f.state.meta.errors)}
                                      </div>
                                    )}
                                  </form.Field>
                                  <form.Field name={`sections[${si}].fields[${fi}].value`}>
                                    {(f) => (
                                      <div className="grid gap-1">
                                        <Textarea
                                          unstyled
                                          aria-label={row.label.trim() || `Value ${fi + 1}`}
                                          placeholder="Not filled in"
                                          value={f.state.value}
                                          onChange={(e) => f.handleChange(e.target.value)}
                                          aria-invalid={f.state.meta.errors.length > 0}
                                          className={cn(soft, oneLine)}
                                        />
                                        {errors(f.state.meta.errors)}
                                      </div>
                                    )}
                                  </form.Field>
                                  {/* Shown on hover or focus where there's a mouse; always on touch. */}
                                  <div className="flex transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 [@media(hover:hover)]:opacity-0">
                                    <Button
                                      type="button"
                                      size="icon-sm"
                                      variant="ghost"
                                      aria-label={
                                        copied === `${si}.${fi}`
                                          ? "Copied"
                                          : `Copy ${row.label || "value"}`
                                      }
                                      disabled={!row.value.trim()}
                                      onClick={() =>
                                        void navigator.clipboard
                                          .writeText(row.value.trim())
                                          .then(() => setCopied(`${si}.${fi}`))
                                      }
                                    >
                                      <HugeiconsIcon icon={Copy01Icon} />
                                    </Button>
                                    <Button
                                      type="button"
                                      size="icon-sm"
                                      variant="ghost"
                                      aria-label={`Remove ${row.label || "field"}`}
                                      onClick={() => fields.removeValue(fi)}
                                    >
                                      <HugeiconsIcon icon={Cancel01Icon} />
                                    </Button>
                                  </div>
                                </div>
                              ))}
                              {section.fields.length === 0 && (
                                <p className="text-muted-foreground px-2.5 py-1 text-xs">
                                  No fields yet.
                                </p>
                              )}
                            </div>
                            {errors(fields.state.meta.errors)}
                          </>
                        )}
                      </form.Field>
                    </Tile>
                  ))}
                  <button
                    type="button"
                    disabled={sections.state.value.length >= 20}
                    onClick={() =>
                      sections.pushValue({ title: "", fields: [{ label: "", value: "" }] })
                    }
                    className={addTile}
                  >
                    <HugeiconsIcon icon={PlusSignIcon} className="size-4" /> Add section
                  </button>
                </div>
                {errors(sections.state.meta.errors)}
              </>
            )}
          </form.Field>
        </div>
      </ScrollArea>
      <div className="flex items-center gap-2 border-t px-6 py-3">
        {status && (
          <p role="status" className="text-sm">
            {status}
          </p>
        )}
        <form.Subscribe selector={(st) => st.isSubmitting}>
          {(submitting) => (
            <Button
              type="button"
              className="ms-auto"
              disabled={submitting}
              onClick={() => void form.handleSubmit()}
            >
              Save prefilled
            </Button>
          )}
        </form.Subscribe>
      </div>
    </div>
  )
}

// One section per step. `fields` maps a validation error back to its step.
const steps = [
  { id: "start", title: "Start", fields: [] },
  { id: "drawn", title: "What you're drawn to", fields: ["interests", "avoid"] },
  { id: "grow", title: "Where you want to grow", fields: ["growthGoal", "skillsToBuild"] },
  { id: "where", title: "Where you want to work", fields: ["locations", "workMode"] },
  { id: "companies", title: "Companies you'd like", fields: ["companies", "companyTraits"] },
  { id: "flags", title: "Red flags", fields: ["redFlagCompanies", "redFlags"] },
  { id: "identity", title: "Who you are", fields: ["identity"] },
  { id: "questions", title: "Important questions", fields: ["answers"] },
  { id: "own", title: "Your own questions", fields: ["custom"] },
  { id: "resume", title: "Resume", fields: [] },
] as const
type StepId = (typeof steps)[number]["id"]

const list = (items: string[]) => items.join(", ")

// One line per step for the side panel, so the profile reads back as it's built.
const summaryOf = (id: StepId, v: Values, resume: Resume): string => {
  switch (id) {
    case "start":
      return "Fill it in yourself, or with your AI assistant"
    case "drawn":
      return list([...v.interests, ...v.avoid.map((a) => `not ${a}`)])
    case "grow":
      return v.growthGoal || list(v.skillsToBuild)
    case "where":
      return list([...(v.workMode === "any" ? [] : [workModeLabels[v.workMode]]), ...v.locations])
    case "companies":
      return list(v.companies) || v.companyTraits
    case "flags":
      return v.redFlags || list(v.redFlagCompanies)
    case "identity":
      return v.identity
    case "questions": {
      const answered = Object.values(v.answers).filter((a) => a.trim()).length
      return answered ? `${answered} of ${questions.length} answered` : ""
    }
    case "own":
      return (v.custom ?? [])
        .filter((c) => c.question.trim())
        .map((c) => `${c.question} ${c.answer}`)
        .join(" · ")
    case "resume":
      return resume?.name ?? ""
  }
}

// Every answer as a label and its value, for the overview.
const rowsOf = (id: StepId, v: Values, resume: Resume): { label: string; value: string }[] => {
  switch (id) {
    case "start":
      return []
    case "drawn":
      return [
        { label: "Interests", value: list(v.interests) },
        { label: "Not interested in", value: list(v.avoid) },
      ]
    case "grow":
      return [
        { label: "Where you want to be", value: v.growthGoal },
        { label: "Skills to build", value: list(v.skillsToBuild) },
      ]
    case "where":
      return [
        { label: "Places", value: list(v.locations) },
        { label: "How you'd like to work", value: workModeLabels[v.workMode] },
      ]
    case "companies":
      return [
        { label: "Companies", value: list(v.companies) },
        { label: "What draws you", value: v.companyTraits },
      ]
    case "flags":
      return [
        { label: "Companies to avoid", value: list(v.redFlagCompanies) },
        { label: "Red flags", value: v.redFlags },
      ]
    case "identity":
      return [{ label: "About you", value: v.identity }]
    case "questions":
      return questions.map((q) => ({ label: q.label, value: v.answers[q.key] }))
    case "own":
      return (v.custom ?? [])
        .filter((c) => c.question.trim())
        .map((c) => ({ label: c.question, value: c.answer }))
    case "resume":
      return [{ label: "File", value: resume?.name ?? "" }]
  }
}

// Big groups take a full row of the tile grid.
const isWide = (rows: { value: string }[]) =>
  rows.length > 5 || rows.some((r) => r.value.length > 120)

// All sections on one page, so changing one answer doesn't mean stepping through the rest.
const Overview = ({
  values,
  resume,
  onEdit,
}: {
  values: Values
  resume: Resume
  onEdit: (step: StepId) => void
}) => (
  <ScrollArea className="min-h-0 flex-1">
    <div className={cn(pageBody, "animate-in fade-in duration-300 motion-reduce:animate-none")}>
      <PageIntro
        title="Overview"
        description="Everything you've told us. Click a row to change it."
      />
      <div className={tileGrid}>
        {steps
          .filter((s) => s.id !== "start")
          .map((s) => {
            const rows = rowsOf(s.id, values, resume)
            return (
              <Tile key={s.id} title={s.title} className={cn(isWide(rows) && "md:col-span-2")}>
                {(rows.length ? rows : [{ label: "Nothing here yet", value: "" }]).map((r, i) => {
                  const value = r.value.trim()
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => onEdit(s.id)}
                      className="hover:bg-accent/40 grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)_auto] items-start gap-1 rounded-md px-2.5 py-1 text-start text-sm transition-colors"
                    >
                      <span className="font-medium">
                        <span className="sr-only">Edit </span>
                        {r.label}
                      </span>
                      <span
                        className={cn(
                          "line-clamp-3 whitespace-pre-wrap",
                          !value && "text-muted-foreground"
                        )}
                      >
                        {value || "Not filled in"}
                      </span>
                      <HugeiconsIcon
                        icon={ArrowRight01Icon}
                        className="text-muted-foreground mt-1 size-3.5"
                      />
                    </button>
                  )
                })}
              </Tile>
            )
          })}
      </div>
    </div>
  </ScrollArea>
)

const PreferencesForm = ({
  saved,
  prefilled,
  resume,
  me,
}: {
  saved: Values
  prefilled: FieldSection[] | null
  resume: Resume
  me: { name: string; email: string; onboarded: boolean }
}) => {
  const { onboarded } = me
  const savePreferences = useMutation(api.preferences.save)
  const skipPreferences = useMutation(api.preferences.skip)
  const navigate = useNavigate()
  const [status, setStatus] = useState<string>()
  const [step, setStep] = useState(0)
  // Which way the last move went, so the next section slides in from that side.
  const [forward, setForward] = useState(true)
  const lastMove = useRef(0)
  const wheel = useRef(0)
  const dragStart = useRef<number>(undefined)
  const goTo = (next: number) => {
    if (next < 0 || next >= steps.length || next === step) return
    setForward(next > step)
    setStep(next)
  }
  // Wheel and drag move one section at a time; the pause stops one fling skipping several.
  const move = (delta: number) => {
    if (Date.now() - lastMove.current < 700) return
    lastMove.current = Date.now()
    goTo(step + delta)
  }
  // First run walks through the steps; after that, the overview is the quicker way in.
  const [tab, setTab] = useState<"overview" | "edit" | "prefilled">(onboarded ? "overview" : "edit")
  const edit = (id: string) => {
    setTab("edit")
    goTo(steps.findIndex((s) => s.id === id))
  }
  // Created once: a new object on each render would count as new defaults, and the form
  // would reset itself, dropping anything filled in but not yet saved.
  const [defaults] = useState(() => ({ ...saved, custom: saved.custom ?? [] }))
  const form = useForm({
    defaultValues: defaults,
    validators: { onSubmit: PreferencesType },
    // Re-check on every save; otherwise one failed save blocks the next even once fixed.
    canSubmitWhenInvalid: true,
    onSubmit: async ({ value }) => {
      setStatus(undefined)
      await savePreferences(value).then(
        () => setStatus("Saved."),
        (error: unknown) => setStatus(messageOf(error))
      )
    },
    // Opens the first step with a problem, since only one step shows at a time.
    onSubmitInvalid: ({ formApi }) => {
      const bad = Object.entries(formApi.state.fieldMeta).find(([, m]) => m?.errors.length)?.[0]
      const index = steps.findIndex((s) => s.fields.some((f) => bad?.startsWith(f)))
      if (index >= 0) goTo(index)
      setStatus("Some answers need fixing.")
    },
  })
  const values = useStore(form.store, (s) => s.values)
  const current = steps[step]!
  const last = step === steps.length - 1

  // Fills only what the assistant answered; anything it left empty keeps its current value.
  const applyDraft = (draft: Draft) => {
    let count = 0
    for (const [key, value] of Object.entries(draft)) {
      if (key === "answers") {
        for (const [q, a] of Object.entries(value as Partial<Values["answers"]>)) {
          if (!a) continue
          form.setFieldValue(`answers.${q as keyof Values["answers"]}`, a)
          count++
        }
      } else if (Array.isArray(value) ? value.length : value) {
        form.setFieldValue(key as keyof Omit<Values, "answers">, value as never)
        count++
      }
    }
    return count
  }

  const tags = (
    name: "interests" | "avoid" | "skillsToBuild" | "locations" | "companies" | "redFlagCompanies",
    label: string,
    placeholder: string
  ) => (
    <form.Field key={name} name={name}>
      {(field) => (
        <div className="grid gap-1.5">
          <Label htmlFor={name}>{label}</Label>
          <TagInput
            id={name}
            value={field.state.value}
            onChange={field.handleChange}
            placeholder={placeholder}
          />
          {errors(field.state.meta.errors)}
        </div>
      )}
    </form.Field>
  )

  const text = (
    name:
      | "growthGoal"
      | "companyTraits"
      | "redFlags"
      | "identity"
      | `answers.${keyof Values["answers"]}`,
    label: string,
    placeholder?: string
  ) => (
    <form.Field key={name} name={name}>
      {(field) => (
        <div className="grid gap-1.5">
          <Label htmlFor={name}>{label}</Label>
          <Textarea
            id={name}
            placeholder={placeholder}
            value={field.state.value}
            onBlur={field.handleBlur}
            onChange={(e) => field.handleChange(e.target.value)}
            aria-invalid={field.state.meta.errors.length > 0}
            className="min-h-16 [field-sizing:content]"
          />
          {errors(field.state.meta.errors)}
        </div>
      )}
    </form.Field>
  )

  const content: Record<StepId, React.ReactNode> = {
    start: (
      <div className="flex flex-col gap-6">
        <PageIntro
          title="Tell us what you're after, in your own words"
          description="No resume parsing and no keyword scores. One short section at a time; every part is optional, and you can change it any time."
        />
        <Prefill onDraft={applyDraft} />
      </div>
    ),
    drawn: (
      <Section
        title="What you're drawn to"
        description="Simple words: topics, problems or kinds of work."
      >
        {tags("interests", "Interests", "e.g. developer tools, climate, design systems")}
        {tags("avoid", "Not interested in", "e.g. ad tech, on-call, crypto")}
      </Section>
    ),
    grow: (
      <Section
        title="Where you want to grow"
        description="Where you see yourself, and the skills you think you're missing."
      >
        {text("growthGoal", "Where do you want to be, and what's in the way?")}
        {tags("skillsToBuild", "Skills you'd like to build", "e.g. system design, public speaking")}
      </Section>
    ),
    where: (
      <Section title="Where you want to work" description="Places, and how you'd like to work.">
        {tags("locations", "Cities, countries or regions", "e.g. Berlin, anywhere in the EU")}
        <form.Field name="workMode">
          {(field) => (
            <div className="grid gap-1.5">
              <Label>How you'd like to work</Label>
              <ToggleGroup
                variant="outline"
                size="sm"
                aria-label="How you'd like to work"
                value={[field.state.value]}
                onValueChange={(v) => v[0] && field.handleChange(v[0] as Values["workMode"])}
              >
                {workModes.map((mode) => (
                  <ToggleGroupItem key={mode} value={mode}>
                    {workModeLabels[mode]}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
          )}
        </form.Field>
      </Section>
    ),
    companies: (
      <Section
        title="Companies you'd like"
        description="Names, and what draws you: culture, how they work, things they've achieved."
      >
        {tags("companies", "Companies you'd love to work for", "e.g. Linear, Stripe")}
        {text(
          "companyTraits",
          "What draws you to a company?",
          "e.g. small teams that ship weekly, published salary bands"
        )}
      </Section>
    ),
    flags: (
      <Section
        title="Red flags"
        description="Companies to avoid, and what makes you walk away from a company or a post."
      >
        {tags("redFlagCompanies", "Companies you'd avoid", "Names")}
        {text("redFlags", "What's a red flag for you?", "e.g. unpaid take-homes, no salary range")}
      </Section>
    ),
    identity: (
      <Section
        title="Who you are"
        description="As a person, not as a candidate. This is the part a resume never shows."
      >
        {text(
          "identity",
          "Describe yourself",
          "What you care about, how you like to work, what people come to you for"
        )}
      </Section>
    ),
    questions: (
      <Section
        title="A few important questions"
        description="Answer what you can. These come up in almost every application."
      >
        {questions.map((q) => text(`answers.${q.key}`, q.label))}
      </Section>
    ),
    own: (
      <Section
        title="Your own questions"
        description="Anything that matters to you and isn't asked above, as a question and your answer."
      >
        <form.Field name="custom" mode="array">
          {(field) => (
            <div className="flex flex-col gap-3">
              {(field.state.value ?? []).map((_, i) => (
                <div key={i} className="bg-muted/30 flex flex-col gap-2 rounded-lg border p-3">
                  <form.Field name={`custom[${i}].question`}>
                    {(q) => (
                      <>
                        <Input
                          aria-label={`Question ${i + 1}`}
                          placeholder="Question, e.g. Do you have a portfolio?"
                          value={q.state.value}
                          onChange={(e) => q.handleChange(e.target.value)}
                          aria-invalid={q.state.meta.errors.length > 0}
                          className="font-medium"
                        />
                        {errors(q.state.meta.errors)}
                      </>
                    )}
                  </form.Field>
                  <form.Field name={`custom[${i}].answer`}>
                    {(a) => (
                      <Textarea
                        aria-label={`Answer ${i + 1}`}
                        placeholder="Your answer"
                        value={a.state.value}
                        onChange={(e) => a.handleChange(e.target.value)}
                        className="min-h-14 [field-sizing:content]"
                      />
                    )}
                  </form.Field>
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    className="self-end"
                    onClick={() => field.removeValue(i)}
                  >
                    Remove
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="self-start"
                disabled={(field.state.value?.length ?? 0) >= 20}
                onClick={() => field.pushValue({ question: "", answer: "" })}
              >
                <HugeiconsIcon icon={PlusSignIcon} /> Add a question
              </Button>
            </div>
          )}
        </form.Field>
      </Section>
    ),
    resume: <ResumeStep resume={resume} />,
  }

  return (
    <form
      noValidate
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={(e) => {
        e.preventDefault()
        void form.handleSubmit()
      }}
      // Enter in a one-line field shouldn't save the whole form.
      onKeyDown={(e) =>
        e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT" && e.preventDefault()
      }
    >
      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as typeof tab)}
        className="flex min-h-0 flex-1 flex-col gap-0"
      >
        <div className="border-b px-4 py-1.5">
          <TabsList size="sm">
            <TabsTab value="overview">Overview</TabsTab>
            <TabsTab value="edit">Edit</TabsTab>
            <TabsTab value="prefilled">Prefilled</TabsTab>
          </TabsList>
        </div>
        <TabsPanel value="overview" className="flex min-h-0">
          <Overview values={values} resume={resume} onEdit={edit} />
        </TabsPanel>
        <TabsPanel value="edit" className="flex min-h-0">
          <div
            className="flex min-w-0 flex-1 flex-col"
            // Scrolling past the end of a section moves to the next one, and past the top to
            // the previous. Small trackpad deltas add up until they reach one wheel notch.
            onWheel={(e) => {
              const view = e.currentTarget.querySelector("[data-slot=scroll-area-viewport]")
              if (!view) return
              const atTop = view.scrollTop <= 0
              const atBottom = view.scrollTop + view.clientHeight >= view.scrollHeight - 1
              if ((e.deltaY > 0 && !atBottom) || (e.deltaY < 0 && !atTop)) {
                wheel.current = 0
                return
              }
              wheel.current += e.deltaY
              if (Math.abs(wheel.current) < 100) return
              move(Math.sign(wheel.current))
              wheel.current = 0
            }}
            // Dragging or swiping up or down on the page, away from fields and buttons, does the same.
            onPointerDown={(e) => {
              const onControl = (e.target as Element).closest(
                "input, textarea, button, a, label, [role=button], [data-slot=scroll-area-scrollbar]"
              )
              dragStart.current = onControl ? undefined : e.clientY
            }}
            onPointerUp={(e) => {
              if (dragStart.current === undefined) return
              const dy = e.clientY - dragStart.current
              dragStart.current = undefined
              if (Math.abs(dy) > 80) move(dy < 0 ? 1 : -1)
            }}
          >
            {/* Keyed by section, so each one starts scrolled to the top. */}
            <ScrollArea key={current.id} className="min-h-0 flex-1">
              {/* Sticky inside the scroller, so its scroll timeline follows this section. */}
              <div
                aria-hidden="true"
                className="section-progress bg-border sticky top-0 z-10 h-0.5"
                style={{ "--step": step, "--steps": steps.length } as React.CSSProperties}
              >
                <span className="bg-primary block h-full" />
              </div>
              <div
                className={cn(
                  pageBody,
                  "animate-in fade-in max-w-2xl gap-2 duration-300 motion-reduce:animate-none",
                  forward ? "slide-in-from-bottom-4" : "slide-in-from-top-4"
                )}
              >
                <span className="text-muted-foreground text-xs">
                  Step {step + 1} of {steps.length} · scroll or drag for the next section
                </span>
                {content[current.id]}
              </div>
            </ScrollArea>
            <div className="flex items-center gap-2 border-t px-6 py-3">
              {!onboarded && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => void skipPreferences().then(() => navigate({ to: "/" }))}
                >
                  Skip for now
                </Button>
              )}
              {status && (
                <p role="status" className="text-sm">
                  {status}
                </p>
              )}
              <div className="ms-auto flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={step === 0}
                  onClick={() => goTo(step - 1)}
                >
                  Back
                </Button>
                {!last && (
                  <Button type="button" variant="outline" onClick={() => goTo(step + 1)}>
                    Next
                  </Button>
                )}
                <form.Subscribe selector={(s) => s.isSubmitting}>
                  {(submitting) => (
                    <Button type="submit" disabled={submitting}>
                      Save preferences
                    </Button>
                  )}
                </form.Subscribe>
              </div>
            </div>
          </div>
          <aside
            aria-label="Your profile so far"
            className="hidden w-80 shrink-0 flex-col border-s lg:flex"
          >
            <ScrollArea>
              <div className="flex flex-col gap-5 p-5">
                <IdentityBlocks values={values} />
                <ol className="flex flex-col">
                  {steps.map((s, i) => {
                    const summary = summaryOf(s.id, values, resume)
                    return (
                      <li key={s.id}>
                        <button
                          type="button"
                          aria-current={i === step ? "step" : undefined}
                          onClick={() => goTo(i)}
                          className="hover:bg-accent/50 aria-[current=step]:bg-accent flex w-full gap-3 rounded-md px-2 py-2 text-start transition-colors"
                        >
                          <span
                            className={cn(
                              "mt-1.5 size-2 shrink-0 rounded-full border",
                              summary ? "bg-primary border-primary" : "border-muted-foreground"
                            )}
                          />
                          <span className="flex min-w-0 flex-col">
                            <span className="text-[13px] font-medium">{s.title}</span>
                            <span className="text-muted-foreground line-clamp-2 text-xs">
                              {summary || "Not yet"}
                            </span>
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ol>
              </div>
            </ScrollArea>
          </aside>
        </TabsPanel>
        {/* Kept mounted so unsaved edits survive switching tabs. */}
        <TabsPanel value="prefilled" keepMounted className="flex min-h-0 data-hidden:hidden">
          <Prefilled saved={prefilled} suggestions={suggestedSections(values, me)} />
        </TabsPanel>
      </Tabs>
    </form>
  )
}

export const Preferences = () => {
  const data = useQuery(api.preferences.get)
  const me = useQuery(api.users.me)
  return (
    <div className="soft-theme bg-background text-foreground flex h-svh flex-col rounded-[inherit] md:h-[calc(100svh-1rem)]">
      <PageHeader crumbs={[{ label: "Preferences" }]} />
      {data && me && (
        <PreferencesForm
          saved={data.preferences ?? emptyPreferences}
          prefilled={data.prefilled}
          resume={data.resume}
          me={me}
        />
      )}
    </div>
  )
}
