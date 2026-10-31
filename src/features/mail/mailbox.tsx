import { api } from "@convex/_generated/api"
import type { Id } from "@convex/_generated/dataModel"
import type { Box } from "@convex/features/mailbox/validators"
import { getRouteApi, Link, useNavigate } from "@tanstack/react-router"
import { useAction, useMutation } from "convex/react"
import type { FunctionReturnType } from "convex/server"
import { usePaginatedQuery, useQuery } from "convex-helpers/react/cache/hooks"
import { lazy, startTransition, Suspense, useActionState, useRef } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverPopup, PopoverTitle, PopoverTrigger } from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import { messageOf } from "@/features/account/settings"
import { CopyButton } from "@/features/contacts/contacts"
import { PageHeader } from "@/features/shell/page-header"
import { cn } from "@/lib/utils"

import type { EditorHandle } from "./editor"

const MailEditor = lazy(() => import("./editor"))

const pageSize = 25

const views = ["inbox", "sent", "drafts", "archived", "trash", "templates"] as const
type View = (typeof views)[number]

const viewNames: Record<View, string> = {
  inbox: "Inbox",
  sent: "Sent",
  drafts: "Drafts",
  archived: "Archived",
  trash: "Trash",
  templates: "Templates",
}

export type MailSearch = {
  view?: View
  label?: string
  open?: string
  // Another email in the open email's thread, when you've picked one.
  message?: string
  // "new", or a draft's id.
  compose?: string
  // The email being answered.
  reply?: string
  // "new", or a template's id.
  template?: string
}

const stringOf = (value: unknown) => (typeof value === "string" && value ? value : undefined)

export const mailSearch = (search: Record<string, unknown>): MailSearch => {
  const view = views.find((v) => v === search.view)
  const [label, open, message, compose, reply, template] = [
    stringOf(search.label),
    stringOf(search.open),
    stringOf(search.message),
    stringOf(search.compose),
    stringOf(search.reply),
    stringOf(search.template),
  ]
  return {
    ...(view && { view }),
    ...(label && { label }),
    ...(open && { open }),
    ...(message && { message }),
    ...(compose && { compose }),
    ...(reply && { reply }),
    ...(template && { template }),
  }
}

const route = getRouteApi("/_app/email")

type Row = FunctionReturnType<typeof api.mailbox.page>["page"][number]

const shortDate = (at: number) =>
  new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(at)

const fullDate = (at: number) =>
  new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(at)

const Editor = (props: React.ComponentProps<typeof MailEditor>) => (
  <Suspense fallback={<Skeleton className="h-60 w-full rounded-lg" />}>
    <MailEditor {...props} />
  </Suspense>
)

// Someone else's HTML can't run anything or load anything here: no scripts, and images from the
// web are blocked, since they can report back when an email is opened.
const frameOf = (html: string) =>
  `<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'"><base target="_blank"><body style="margin:0;padding:16px;font-family:Arial,sans-serif;font-size:14px;background:#fff;color:#111">${html}</body>`

const LabelsMenu = ({ row }: { row: Row }) => {
  const known = useQuery(api.mailbox.labels)
  const setLabels = useMutation(api.mailbox.setLabels)
  const [error, save, pending] = useActionState(
    async (_: string | undefined, labels: string[]) =>
      setLabels({ eventId: row.id, labels }).then(() => undefined, messageOf),
    undefined
  )
  const change = (labels: string[]) => startTransition(() => save(labels))
  const names = [...new Set([...(known ?? []), ...row.labels])]
  return (
    <Popover>
      <PopoverTrigger render={<Button size="xs" variant="ghost" />}>Labels</PopoverTrigger>
      <PopoverPopup align="end" className="w-64">
        <PopoverTitle className="mb-2 text-sm">Labels</PopoverTitle>
        <div className="flex flex-col gap-1.5">
          {names.map((name) => (
            <label key={name} className="flex items-center gap-2 text-[13px]">
              <input
                type="checkbox"
                checked={row.labels.includes(name)}
                disabled={pending}
                onChange={(e) =>
                  change(
                    e.target.checked ? [...row.labels, name] : row.labels.filter((l) => l !== name)
                  )
                }
              />
              {name}
            </label>
          ))}
          <form
            className="flex gap-1.5"
            action={(form) => change([...row.labels, form.get("label") as string])}
          >
            <Input name="label" aria-label="New label" placeholder="New label" maxLength={30} />
            <Button type="submit" size="sm" variant="outline" disabled={pending}>
              Add
            </Button>
          </form>
          {error && (
            <p role="alert" className="text-destructive text-xs">
              {error}
            </p>
          )}
        </div>
      </PopoverPopup>
    </Popover>
  )
}

// One line of the email's details: easy to read, select and copy.
const HeaderValue = ({
  label,
  value,
  children,
}: {
  label: string
  value: string
  children?: React.ReactNode
}) => (
  <>
    <dt className="text-muted-foreground">{label}</dt>
    <dd className="flex min-w-0 flex-wrap items-center gap-x-1">
      <span className="min-w-0 break-words">{value}</span>
      <CopyButton text={value} label={`Copy ${label.toLowerCase()}`} />
      {children}
    </dd>
  </>
)

const AddContact = ({ email, name, company }: { email: string; name: string; company: string }) => {
  const known = useQuery(api.contacts.known, { email })
  const save = useAction(api.contacts.save)
  const [error, add, pending] = useActionState(
    async () =>
      save({ company, name, email, title: "", phone: "", notes: "" }).then(
        () => undefined,
        messageOf
      ),
    undefined
  )
  if (known === undefined) return null
  if (known) return <span className="text-muted-foreground">In contacts</span>
  return (
    <>
      <Button size="xs" variant="ghost" disabled={pending} onClick={() => startTransition(add)}>
        Add to contacts
      </Button>
      {error && (
        <span role="alert" className="text-destructive">
          {error}
        </span>
      )}
    </>
  )
}

// A collapsed email in a thread. Only the one you're reading gets opened.
const ThreadLine = ({ message }: { message: Row }) => {
  const markRead = useMutation(api.mailbox.markRead)
  return (
    <Link
      from="/email"
      search={(s) => ({ ...s, message: message.id })}
      onClick={() => {
        if (!message.read) void markRead({ eventId: message.id })
      }}
      className="hover:bg-accent/40 flex items-baseline gap-2 border-b px-4 py-1.5 text-xs"
    >
      <span className={cn("min-w-0 flex-1 truncate", !message.read && "font-semibold")}>
        {message.sent ? `You to ${message.to ?? ""}` : message.from}
      </span>
      <span className="text-muted-foreground shrink-0">{fullDate(message.at)}</span>
    </Link>
  )
}

const ThreadLines = ({ messages }: { messages: Row[] }) =>
  messages.length > 0 && (
    <div className="max-h-[25%] shrink-0 overflow-y-auto border-t">
      {messages.map((message) => (
        <ThreadLine key={message.id} message={message} />
      ))}
    </div>
  )

const Reader = ({ row }: { row: Row }) => {
  const { reply, message } = route.useSearch()
  const thread = useQuery(api.mailbox.thread, { eventId: row.id })
  const messages = thread?.some((m) => m.id === row.id) ? thread : [row]
  const shown = messages.find((m) => m.id === message) ?? row
  const shownAt = messages.findIndex((m) => m.id === shown.id)
  const mail = useQuery(api.mailbox.content, { eventId: shown.id })
  const move = useMutation(api.mailbox.move)
  const remove = useMutation(api.mailbox.deleteForever)
  const navigate = useNavigate({ from: "/email" })
  const close = () =>
    void navigate({
      search: ({ open: _open, message: _message, reply: _reply, ...rest }) => rest,
    })
  const closeReply = () => void navigate({ search: ({ reply: _reply, ...rest }) => rest })
  const other = mail && (mail.sent ? mail.to : mail.from)
  return (
    <section aria-label="Email" className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-1 border-b px-3 py-2">
        <Button size="xs" variant="ghost" className="md:hidden" onClick={close}>
          Back
        </Button>
        {row.box === "trash" || row.box === "archived" ? (
          <Button
            size="xs"
            variant="ghost"
            onClick={() => void move({ eventId: row.id, to: "back" })}
          >
            {row.box === "trash" ? "Restore" : "Move back"}
          </Button>
        ) : (
          <Button
            size="xs"
            variant="ghost"
            onClick={() => void move({ eventId: row.id, to: "archived" })}
          >
            Archive
          </Button>
        )}
        {row.box === "trash" ? (
          <Button
            size="xs"
            variant="ghost"
            className="text-destructive"
            onClick={() => {
              if (window.confirm("Delete this email for good? This can't be undone."))
                void remove({ eventId: row.id }).then(close)
            }}
          >
            Delete forever
          </Button>
        ) : (
          <Button
            size="xs"
            variant="ghost"
            onClick={() => void move({ eventId: row.id, to: "trash" })}
          >
            Trash
          </Button>
        )}
        <LabelsMenu row={row} />
      </div>
      <div className="flex flex-wrap items-center gap-x-1 px-4 py-3">
        <h2 className="min-w-0 text-base font-semibold break-words">{shown.subject}</h2>
        <CopyButton key={shown.id} text={shown.subject} label="Copy subject" />
      </div>
      <ThreadLines messages={messages.slice(0, shownAt)} />
      <dl
        key={shown.id}
        className={cn(
          "grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-3 border-b px-4 pb-3 text-xs",
          shownAt > 0 && "pt-3"
        )}
      >
        {mail && (
          <>
            <HeaderValue label="From" value={mail.from}>
              {mail.fromName && <span className="text-muted-foreground">{mail.fromName}</span>}
              {!mail.sent && (
                <AddContact
                  email={mail.from}
                  name={mail.fromName ?? ""}
                  company={shown.company ?? ""}
                />
              )}
            </HeaderValue>
            <HeaderValue label="To" value={mail.to}>
              {mail.sent && other && (
                <AddContact email={other} name="" company={shown.company ?? ""} />
              )}
            </HeaderValue>
          </>
        )}
        <HeaderValue label="Date" value={fullDate(shown.at)} />
        {shown.applicationId && shown.company && (
          <>
            <dt className="text-muted-foreground">Application</dt>
            <dd className="py-0.5">
              <Link to="/" search={{ app: shown.applicationId }} className="underline">
                {shown.company}
              </Link>
            </dd>
          </>
        )}
        {mail && mail.attachments.length > 0 && (
          <>
            <dt className="text-muted-foreground">Attached</dt>
            <dd className="py-0.5 break-words">{mail.attachments.join(", ")}</dd>
          </>
        )}
      </dl>
      {mail === undefined ? (
        <div className="p-4">
          <Skeleton className="h-32 w-full" />
        </div>
      ) : mail === null ? (
        <p className="text-muted-foreground p-4 text-[13px]">This email can't be read anymore.</p>
      ) : mail.html ? (
        <iframe
          title={`Email: ${shown.subject}`}
          // No scripts, and links open outside it.
          sandbox="allow-popups allow-popups-to-escape-sandbox"
          srcDoc={frameOf(mail.html)}
          className="min-h-0 w-full flex-1 bg-white"
        />
      ) : (
        <ScrollArea className="min-h-0 flex-1">
          <p className="p-4 text-[13px] leading-relaxed whitespace-pre-wrap">
            {mail.text || "(no text)"}
          </p>
        </ScrollArea>
      )}
      <ThreadLines messages={messages.slice(shownAt + 1)} />
      {mail && other && row.box !== "trash" && (
        <div className="max-h-[70%] shrink-0 overflow-y-auto border-t">
          {reply === row.id ? (
            <ComposeForm
              key={shown.id}
              inline
              start={{
                // Your own sent mail gets answered to whoever you sent it to.
                to: other,
                subject: /^re:/i.test(mail.subject) ? mail.subject : `Re: ${mail.subject}`,
                replyTo: shown.id,
                ...(shown.applicationId && { applicationId: shown.applicationId }),
              }}
              onDone={closeReply}
            />
          ) : (
            <div className="p-3">
              <Button
                size="sm"
                variant="outline"
                render={<Link from="/email" search={(s) => ({ ...s, reply: row.id })} />}
              >
                Reply
              </Button>
            </div>
          )}
        </div>
      )}
    </section>
  )
}

const MailRow = ({ row, open }: { row: Row; open: boolean }) => {
  const markRead = useMutation(api.mailbox.markRead)
  return (
    <li>
      <Link
        from="/email"
        search={({ message: _message, ...s }) => ({ ...s, open: row.id })}
        onClick={() => {
          if (!row.read) void markRead({ eventId: row.id })
        }}
        aria-current={open ? "true" : undefined}
        className={cn(
          "hover:bg-accent/40 flex flex-col gap-0.5 border-b px-3 py-2.5 text-[13px]",
          open && "bg-accent/60"
        )}
      >
        <span className="flex items-baseline gap-2">
          <span className={cn("min-w-0 flex-1 truncate", !row.read && "font-semibold")}>
            {row.sent ? `To ${row.to ?? ""}` : row.from}
          </span>
          <span className="text-muted-foreground shrink-0 text-xs">{shortDate(row.at)}</span>
        </span>
        <span className={cn("truncate", !row.read ? "font-medium" : "text-muted-foreground")}>
          {row.subject}
        </span>
        {(row.company || row.labels.length > 0) && (
          <span className="mt-0.5 flex flex-wrap gap-1">
            {row.company && (
              <Badge variant="secondary" size="sm" className="font-normal">
                {row.company}
              </Badge>
            )}
            {row.labels.map((label) => (
              <Badge key={label} variant="outline" size="sm" className="font-normal">
                {label}
              </Badge>
            ))}
          </span>
        )}
      </Link>
    </li>
  )
}

const Empty = ({ children }: { children: React.ReactNode }) => (
  <p className="text-muted-foreground p-4 text-[13px]">{children}</p>
)

const MailList = ({ box, label, open }: { box: Box; label?: string; open?: string }) => {
  const { results, status, loadMore } = usePaginatedQuery(
    api.mailbox.page,
    label ? { label } : { box },
    { initialNumItems: pageSize }
  )
  const opened = results.find((r) => r.id === open)
  return (
    <>
      <div
        className={cn(
          "flex min-h-0 w-full flex-col border-e md:w-80 md:shrink-0",
          opened && "hidden md:flex"
        )}
      >
        <ScrollArea className="min-h-0 flex-1">
          {status === "LoadingFirstPage" && (
            <div className="flex flex-col gap-2 p-3">
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </div>
          )}
          {status !== "LoadingFirstPage" && results.length === 0 && <Empty>Nothing here.</Empty>}
          <ul>
            {results.map((row) => (
              <MailRow key={row.id} row={row} open={row.id === open} />
            ))}
          </ul>
          {status === "CanLoadMore" && (
            <div className="p-2 text-center">
              <Button size="xs" variant="ghost" onClick={() => loadMore(pageSize)}>
                Load more
              </Button>
            </div>
          )}
        </ScrollArea>
      </div>
      {opened ? (
        <Reader key={opened.id} row={opened} />
      ) : (
        <div className="hidden flex-1 md:block">
          <Empty>Pick an email to read it.</Empty>
        </div>
      )}
    </>
  )
}

const DraftList = () => {
  const { results, status, loadMore } = usePaginatedQuery(
    api.mailbox.drafts,
    {},
    { initialNumItems: pageSize }
  )
  const remove = useMutation(api.mailbox.deleteDraft)
  return (
    <ScrollArea className="min-h-0 flex-1">
      {status !== "LoadingFirstPage" && results.length === 0 && <Empty>No drafts.</Empty>}
      <ul>
        {results.map((d) => (
          <li key={d.id} className="flex items-center gap-2 border-b px-3 py-2 text-[13px]">
            <Link
              from="/email"
              search={(s) => ({ ...s, compose: d.id })}
              className="flex min-w-0 flex-1 flex-col hover:underline"
            >
              <span className="truncate">{d.to ? `To ${d.to}` : "No recipient yet"}</span>
              <span className="text-muted-foreground truncate">{d.subject || "(no subject)"}</span>
            </Link>
            <span className="text-muted-foreground shrink-0 text-xs">{shortDate(d.updatedAt)}</span>
            <Button size="xs" variant="ghost" onClick={() => void remove({ id: d.id })}>
              Discard
            </Button>
          </li>
        ))}
      </ul>
      {status === "CanLoadMore" && (
        <div className="p-2 text-center">
          <Button size="xs" variant="ghost" onClick={() => loadMore(pageSize)}>
            Load more
          </Button>
        </div>
      )}
    </ScrollArea>
  )
}

const TemplateList = () => {
  const templates = useQuery(api.mailbox.templates)
  const remove = useMutation(api.mailbox.removeTemplate)
  return (
    <ScrollArea className="min-h-0 flex-1">
      <div className="flex items-center gap-3 border-b px-3 py-2">
        <p className="text-muted-foreground me-auto text-xs">
          Use {"{company}"} and {"{role}"} and they fill in when you pick an application.
        </p>
        <Button
          size="xs"
          variant="outline"
          render={<Link from="/email" search={(s) => ({ ...s, template: "new" })} />}
        >
          New template
        </Button>
      </div>
      {templates?.length === 0 && <Empty>No templates yet.</Empty>}
      <ul>
        {templates?.map((t) => (
          <li key={t.id} className="flex items-center gap-2 border-b px-3 py-2 text-[13px]">
            <Link
              from="/email"
              search={(s) => ({ ...s, template: t.id })}
              className="flex min-w-0 flex-1 flex-col hover:underline"
            >
              <span className="truncate font-medium">{t.name}</span>
              <span className="text-muted-foreground truncate">{t.subject || "(no subject)"}</span>
            </Link>
            <Button
              size="xs"
              variant="ghost"
              onClick={() => {
                if (window.confirm(`Remove “${t.name}”?`)) void remove({ id: t.id })
              }}
            >
              Remove
            </Button>
          </li>
        ))}
      </ul>
    </ScrollArea>
  )
}

const TemplateForm = ({
  template,
  onDone,
}: {
  template?: FunctionReturnType<typeof api.mailbox.templates>[number]
  onDone: () => void
}) => {
  const save = useMutation(api.mailbox.saveTemplate)
  const editor = useRef<EditorHandle>(null)
  const [error, submit, pending] = useActionState(async (_: string | undefined, form: FormData) => {
    try {
      await save({
        ...(template && { id: template.id }),
        name: form.get("name") as string,
        subject: form.get("subject") as string,
        html: editor.current?.html() ?? "",
      })
      onDone()
      return undefined
    } catch (cause) {
      return messageOf(cause)
    }
  }, undefined)
  return (
    <form action={submit} className="contents">
      <DialogHeader>
        <DialogTitle>{template ? "Edit template" : "New template"}</DialogTitle>
      </DialogHeader>
      <DialogPanel className="grid gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor="template-name">Name</Label>
          <Input
            id="template-name"
            name="name"
            defaultValue={template?.name}
            maxLength={80}
            required
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="template-subject">Subject</Label>
          <Input
            id="template-subject"
            name="subject"
            defaultValue={template?.subject}
            maxLength={500}
          />
        </div>
        <Editor
          handle={editor}
          label="Template body"
          {...(template && { initialHtml: template.html })}
        />
        {error && (
          <p role="alert" className="text-destructive text-xs">
            {error}
          </p>
        )}
      </DialogPanel>
      <DialogFooter>
        <DialogClose render={<Button variant="ghost" />}>Cancel</DialogClose>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </DialogFooter>
    </form>
  )
}

const fillIn = (text: string, application?: { company: string; role: string }) =>
  application
    ? text.replaceAll("{company}", application.company).replaceAll("{role}", application.role)
    : text

// The form itself, drawn once what it starts from has loaded.
const ComposeForm = ({
  draftId,
  start,
  onDone,
  onSaved,
  inline = false,
}: {
  draftId?: Id<"mailDrafts">
  start: {
    to?: string
    subject?: string
    html?: string
    applicationId?: Id<"applications">
    replyTo?: Id<"mailEvents">
  }
  onDone: () => void
  onSaved?: (id: Id<"mailDrafts">) => void
  // Under the email it answers, rather than in a dialog.
  inline?: boolean
}) => {
  const send = useAction(api.email.sendFromApplication)
  const saveDraft = useAction(api.mailbox.saveDraft)
  const applications = useQuery(api.applications.list)
  const templates = useQuery(api.mailbox.templates)
  const editor = useRef<EditorHandle>(null)
  const formRef = useRef<HTMLFormElement>(null)
  // An inline reply stays put when saved, so later saves and sending need to know its draft.
  const savedDraft = useRef(draftId)
  type State = { error?: string; saved?: boolean }
  const [state, act, pending] = useActionState<State, "send" | "save">(async (_, step) => {
    const form = new FormData(formRef.current!)
    const applicationId = form.get("application") as string as Id<"applications"> | ""
    const body = {
      to: form.get("to") as string,
      subject: form.get("subject") as string,
      html: editor.current?.html() ?? "",
      text: editor.current?.text() ?? "",
      ...(applicationId && { applicationId }),
      ...(start.replyTo && { replyTo: start.replyTo }),
    }
    try {
      if (step === "save") {
        const id = await saveDraft({
          ...body,
          ...(savedDraft.current && { id: savedDraft.current }),
        })
        savedDraft.current = id
        onSaved?.(id)
        return { saved: true }
      }
      if (editor.current?.isEmpty()) return { error: "Write something first." }
      await send({ ...body, ...(savedDraft.current && { draftId: savedDraft.current }) })
      onDone()
      return {}
    } catch (cause) {
      return { error: messageOf(cause) }
    }
  }, {})
  const run = (step: "send" | "save") => startTransition(() => act(step))
  const applyTemplate = (id: string) => {
    const template = templates?.find((t) => t.id === id)
    if (!template || !formRef.current) return
    const chosen = new FormData(formRef.current).get("application")
    const application = applications?.find((a) => a._id === chosen)
    // A reply keeps the subject of the email it answers.
    if (!inline) {
      const subject = formRef.current.elements.namedItem("subject") as HTMLInputElement
      subject.value = fillIn(template.subject, application)
    }
    editor.current?.setHtml(fillIn(template.html, application))
  }
  const Fields = inline ? "div" : DialogPanel
  const actions = (
    <>
      <Button type="button" variant="outline" disabled={pending} onClick={() => run("save")}>
        Save draft
      </Button>
      <Button type="submit" disabled={pending}>
        {pending ? "Working…" : "Send"}
      </Button>
    </>
  )
  return (
    <form
      ref={formRef}
      className="contents"
      onSubmit={(e) => {
        e.preventDefault()
        run("send")
      }}
    >
      {!inline && (
        <DialogHeader>
          <DialogTitle>{draftId ? "Draft" : "New email"}</DialogTitle>
          {draftId && <DialogDescription>Saved in your Drafts.</DialogDescription>}
        </DialogHeader>
      )}
      <Fields className={cn("grid gap-3", inline && "p-3")}>
        <div className="grid gap-1.5">
          <Label htmlFor="mail-to">To</Label>
          <Input id="mail-to" name="to" type="email" defaultValue={start.to} required />
        </div>
        {inline ? (
          <>
            {/* A reply keeps its subject and application, so neither needs asking. */}
            <input type="hidden" name="subject" value={start.subject} />
            <input type="hidden" name="application" value={start.applicationId ?? ""} />
          </>
        ) : (
          <>
            <div className="grid gap-1.5">
              <Label htmlFor="mail-subject">Subject</Label>
              <Input
                id="mail-subject"
                name="subject"
                defaultValue={start.subject}
                maxLength={500}
                required
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="mail-application">Application</Label>
              <select
                id="mail-application"
                name="application"
                defaultValue={start.applicationId ?? ""}
                className="border-input bg-background h-8 min-w-0 rounded-md border px-2 text-[13px]"
              >
                <option value="">None</option>
                {applications?.map((a) => (
                  <option key={a._id} value={a._id}>
                    {a.company}: {a.role}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}
        <div className="grid gap-1.5">
          <Label htmlFor="mail-template">Template</Label>
          <select
            id="mail-template"
            defaultValue=""
            onChange={(e) => applyTemplate(e.target.value)}
            className="border-input bg-background h-8 min-w-0 rounded-md border px-2 text-[13px]"
          >
            <option value="">None</option>
            {templates?.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        <Editor
          handle={editor}
          label="Email body"
          {...(start.html && { initialHtml: start.html })}
        />
        {state.error && (
          <p role="alert" className="text-destructive text-xs">
            {state.error}
          </p>
        )}
        {inline && state.saved && (
          <p className="text-muted-foreground text-xs">Saved in your Drafts.</p>
        )}
      </Fields>
      {inline ? (
        <div className="flex justify-end gap-2 px-3 pb-3">
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
          {actions}
        </div>
      ) : (
        <DialogFooter>
          <DialogClose render={<Button variant="ghost" />}>Close</DialogClose>
          {actions}
        </DialogFooter>
      )}
    </form>
  )
}

const FromDraft = (props: {
  id: Id<"mailDrafts">
  onDone: () => void
  onSaved: (id: Id<"mailDrafts">) => void
}) => {
  const draft = useQuery(api.mailbox.draft, { id: props.id })
  if (!draft)
    return <DialogPanel>{draft === null ? "That draft is gone." : "Opening…"}</DialogPanel>
  return (
    <ComposeForm
      key={props.id}
      draftId={props.id}
      start={draft}
      onDone={props.onDone}
      onSaved={props.onSaved}
    />
  )
}

const FromTemplate = ({ id, onDone }: { id: string; onDone: () => void }) => {
  const templates = useQuery(api.mailbox.templates)
  if (id === "new") return <TemplateForm onDone={onDone} />
  if (!templates) return <DialogPanel>Opening…</DialogPanel>
  const template = templates.find((t) => t.id === id)
  return template ? (
    <TemplateForm template={template} onDone={onDone} />
  ) : (
    <DialogPanel>That template is gone.</DialogPanel>
  )
}

// Your mail: folders on the left, a page of mail, and the one you've opened. Everything about
// what's showing lives in the URL.
export const Mailbox = () => {
  const search = route.useSearch()
  const navigate = useNavigate({ from: "/email" })
  const labels = useQuery(api.mailbox.labels)
  const view = search.view ?? "inbox"
  const dialog = search.compose ?? search.template
  const closeDialog = () =>
    void navigate({
      search: ({ compose: _c, template: _t, ...rest }) => rest,
    })
  const onSaved = (id: Id<"mailDrafts">) =>
    void navigate({ search: (rest) => ({ ...rest, compose: id }), replace: true })
  const navItem = (active: boolean) =>
    cn(
      "hover:bg-accent/40 shrink-0 rounded-md px-2 py-1.5 text-[13px] md:truncate",
      active && "bg-accent font-medium"
    )
  return (
    <div className="soft-theme bg-background text-foreground flex h-svh flex-col rounded-[inherit] md:h-[calc(100svh-1rem)]">
      <PageHeader
        crumbs={[{ label: "Email" }]}
        actions={
          <Button
            size="sm"
            render={<Link from="/email" search={(s) => ({ ...s, compose: "new" })} />}
          >
            New email
          </Button>
        }
      />
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <nav
          aria-label="Folders"
          className="flex shrink-0 gap-0.5 overflow-x-auto border-b p-2 md:w-44 md:flex-col md:overflow-y-auto md:border-e md:border-b-0"
        >
          {views.map((v) => (
            <Link
              key={v}
              to="/email"
              search={v === "inbox" ? {} : { view: v }}
              aria-current={view === v && !search.label ? "page" : undefined}
              className={navItem(view === v && !search.label)}
            >
              {viewNames[v]}
            </Link>
          ))}
          {labels && labels.length > 0 && (
            <>
              <p className="text-muted-foreground mt-3 hidden px-2 text-xs md:block">Labels</p>
              {labels.map((label) => (
                <Link
                  key={label}
                  to="/email"
                  search={{ label }}
                  aria-current={search.label === label ? "page" : undefined}
                  className={navItem(search.label === label)}
                >
                  {label}
                </Link>
              ))}
            </>
          )}
        </nav>
        <main className="flex min-h-0 min-w-0 flex-1">
          {view === "drafts" && !search.label ? (
            <DraftList />
          ) : view === "templates" && !search.label ? (
            <TemplateList />
          ) : (
            <MailList
              box={(view === "drafts" || view === "templates" ? "inbox" : view) as Box}
              {...(search.label && { label: search.label })}
              {...(search.open && { open: search.open })}
            />
          )}
        </main>
      </div>
      <Dialog open={Boolean(dialog)} onOpenChange={(open) => !open && closeDialog()}>
        <DialogPopup className="sm:max-w-2xl">
          {search.template ? (
            <FromTemplate id={search.template} onDone={closeDialog} />
          ) : search.compose && search.compose !== "new" ? (
            <FromDraft
              id={search.compose as Id<"mailDrafts">}
              onDone={closeDialog}
              onSaved={onSaved}
            />
          ) : (
            <ComposeForm start={{}} onDone={closeDialog} onSaved={onSaved} />
          )}
        </DialogPopup>
      </Dialog>
    </div>
  )
}
