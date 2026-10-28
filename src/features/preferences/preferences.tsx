import { api } from "@convex/_generated/api"
import type { Id } from "@convex/_generated/dataModel"
import {
  emptyPreferences,
  maxResumeBytes,
  Preferences as PreferencesType,
  PreferencesDraft,
  resumeTypes,
  workModes,
} from "@convex/api/features/users/validators"
import { Cancel01Icon, Copy01Icon, SparklesIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useForm, useStore } from "@tanstack/react-form"
import { useNavigate } from "@tanstack/react-router"
import { useMutation, useQuery } from "convex/react"
import { ConvexError } from "convex/values"
import { useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Textarea } from "@/components/ui/textarea"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { PageHeader } from "@/features/shell/page-header"

import { IdentityBlocks } from "./identity-blocks"
import { assistantPrompt, parseReply } from "./prompt"

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
  <section className="grid gap-4 border-t pt-6 md:grid-cols-[12rem_minmax(0,1fr)] md:gap-8">
    <div className="flex flex-col gap-1">
      <h2 className="text-sm font-medium">{title}</h2>
      <p className="text-muted-foreground text-xs leading-relaxed">{description}</p>
    </div>
    <div className="flex flex-col gap-4">{children}</div>
  </section>
)

// Copy the prompt, run it in your own assistant, paste the JSON reply back.
const Prefill = ({ onDraft }: { onDraft: (draft: Draft) => number }) => {
  const [reply, setReply] = useState("")
  const [status, setStatus] = useState<{ ok: boolean; text: string }>()
  const [copied, setCopied] = useState(false)
  return (
    <section className="bg-muted/40 flex flex-col gap-4 rounded-xl border p-5">
      <div className="flex items-start gap-3">
        <span className="bg-background flex size-8 shrink-0 items-center justify-center rounded-md border">
          <HugeiconsIcon icon={SparklesIcon} className="size-4" />
        </span>
        <div className="flex flex-col gap-1">
          <h2 className="text-sm font-medium">Fill this in with your own AI assistant</h2>
          <p className="text-muted-foreground text-xs leading-relaxed">
            This prompt is for you to paste into ChatGPT, Claude or any assistant you already use.
            It interviews you and writes your answers in a format this form can read. Nothing leaves
            this page until you paste the reply below, and you can edit every answer before saving.
          </p>
        </div>
      </div>
      <ol className="text-muted-foreground grid gap-1 ps-11 text-xs">
        <li>1. Copy the prompt and paste it into your assistant.</li>
        <li>2. Answer its questions. Paste in notes or a LinkedIn summary if that's quicker.</li>
        <li>3. Paste its final reply here and fill the form.</li>
      </ol>
      <div className="flex flex-wrap gap-2 ps-11">
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
      <div className="flex flex-col gap-2 ps-11">
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
    </section>
  )
}

const Resume = ({ resume }: { resume: { name: string; url: string | null } | null }) => {
  const generateUploadUrl = useMutation(api.users.generateUploadUrl)
  const setResume = useMutation(api.users.setResume)
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

const PreferencesForm = ({
  saved,
  resume,
  onboarded,
}: {
  saved: Values
  resume: { name: string; url: string | null } | null
  onboarded: boolean
}) => {
  const savePreferences = useMutation(api.users.savePreferences)
  const skipPreferences = useMutation(api.users.skipPreferences)
  const navigate = useNavigate()
  const [status, setStatus] = useState<string>()
  const form = useForm({
    defaultValues: saved,
    validators: { onSubmit: PreferencesType },
    onSubmit: async ({ value }) => {
      setStatus(undefined)
      await savePreferences(value).then(
        () => setStatus("Saved."),
        (error: unknown) => setStatus(messageOf(error))
      )
    },
  })
  const values = useStore(form.store, (s) => s.values)

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
          {field.state.meta.errors.map((error) => (
            <p key={error?.message} className="text-destructive text-xs">
              {error?.message}
            </p>
          ))}
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
          {field.state.meta.errors.map((error) => (
            <p key={error?.message} className="text-destructive text-xs">
              {error?.message}
            </p>
          ))}
        </div>
      )}
    </form.Field>
  )

  return (
    <form
      noValidate
      className="flex flex-col gap-8"
      onSubmit={(e) => {
        e.preventDefault()
        void form.handleSubmit()
      }}
    >
      <div className="flex flex-col items-start gap-6 md:flex-row md:justify-between">
        <div className="flex max-w-md flex-col gap-2">
          <h2 className="font-heading text-xl font-semibold">
            Tell us what you're after, in your own words
          </h2>
          <p className="text-muted-foreground text-sm leading-relaxed">
            No resume parsing and no keyword scores. Short answers are fine, every part is optional,
            and you can change them any time.
          </p>
        </div>
        <IdentityBlocks values={values} />
      </div>

      <Prefill onDraft={applyDraft} />

      <Section
        title="What you're drawn to"
        description="Simple words: topics, problems or kinds of work."
      >
        {tags("interests", "Interests", "e.g. developer tools, climate, design systems")}
        {tags("avoid", "Not interested in", "e.g. ad tech, on-call, crypto")}
      </Section>

      <Section
        title="Where you want to grow"
        description="Where you see yourself, and the skills you think you're missing."
      >
        {text("growthGoal", "Where do you want to be, and what's in the way?")}
        {tags("skillsToBuild", "Skills you'd like to build", "e.g. system design, public speaking")}
      </Section>

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

      <Section
        title="Red flags"
        description="Companies to avoid, and what makes you walk away from a company or a post."
      >
        {tags("redFlagCompanies", "Companies you'd avoid", "Names")}
        {text("redFlags", "What's a red flag for you?", "e.g. unpaid take-homes, no salary range")}
      </Section>

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

      <Section
        title="A few important questions"
        description="Answer what you can. These come up in almost every application."
      >
        {questions.map((q) => text(`answers.${q.key}`, q.label))}
      </Section>

      <Resume resume={resume} />

      <div className="bg-background/90 sticky bottom-0 -mx-6 flex items-center justify-end gap-3 border-t px-6 py-3 backdrop-blur">
        {status && (
          <p role="status" className="me-auto text-sm">
            {status}
          </p>
        )}
        {!onboarded && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => void skipPreferences().then(() => navigate({ to: "/" }))}
          >
            Skip for now
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
    </form>
  )
}

export const Preferences = () => {
  const data = useQuery(api.users.preferences)
  const me = useQuery(api.users.me)
  return (
    <div className="flex h-svh flex-col md:h-[calc(100svh-1rem)]">
      <PageHeader crumbs={[{ label: "Preferences" }]} />
      <ScrollArea className="min-h-0 flex-1">
        <div className="mx-auto max-w-3xl px-6 pt-8">
          {data && me && (
            <PreferencesForm
              saved={data.preferences ?? emptyPreferences}
              resume={data.resume}
              onboarded={me.onboarded}
            />
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
