import { api } from "@/lib/api"
import { Link } from "@tanstack/react-router"
import { useAction, useMutation } from "convex/react"
import type { FunctionReturnType } from "convex/server"
import { useQuery } from "convex-helpers/react/cache/hooks"
import { startTransition, useActionState } from "react"

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
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { messageOf } from "@/features/account/settings"
import { PageIntro, pageBody } from "@/features/shell/page-body"
import { PageHeader } from "@/features/shell/page-header"

type Contact = FunctionReturnType<typeof api.contacts.list>[number]

const fields = [
  { name: "company", label: "Company" },
  { name: "name", label: "Name" },
  { name: "email", label: "Email" },
  { name: "title", label: "Title" },
  { name: "phone", label: "Phone" },
] as const

// Inside the dialog, so it starts fresh each time the dialog opens.
const ContactForm = ({ contact }: { contact?: Contact }) => {
  const save = useAction(api.contacts.save)
  const [state, submit, pending] = useActionState<{ saved?: boolean; error?: string }, FormData>(
    async (_, form) => {
      const value = (name: string) => form.get(name) as string
      try {
        await save({
          ...(contact && { id: contact.id }),
          company: value("company"),
          name: value("name"),
          email: value("email"),
          title: value("title"),
          phone: value("phone"),
          notes: value("notes"),
        })
        return { saved: true }
      } catch (cause) {
        return { error: messageOf(cause) }
      }
    },
    {}
  )
  if (state.saved)
    return (
      <>
        <DialogHeader>
          <DialogTitle>Saved</DialogTitle>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Close</DialogClose>
        </DialogFooter>
      </>
    )
  return (
    <form action={submit} className="contents">
      <DialogHeader>
        <DialogTitle>{contact ? "Edit contact" : "Add a contact"}</DialogTitle>
        <DialogDescription>
          {contact
            ? "Later mail won't change what you write here."
            : "A name or an email is enough."}
        </DialogDescription>
      </DialogHeader>
      <DialogPanel className="grid gap-4">
        {fields.map(({ name, label }) => (
          <div key={name} className="grid gap-1.5">
            <Label htmlFor={`contact-${name}`}>{label}</Label>
            <Input
              id={`contact-${name}`}
              name={name}
              type={name === "email" ? "email" : "text"}
              defaultValue={contact?.[name]}
            />
          </div>
        ))}
        <div className="grid gap-1.5">
          <Label htmlFor="contact-notes">Notes</Label>
          <Textarea id="contact-notes" name="notes" rows={3} defaultValue={contact?.notes} />
        </div>
        {state.error && (
          <p role="alert" className="text-destructive text-xs">
            {state.error}
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

const EditContact = ({ contact, trigger }: { contact?: Contact; trigger: React.ReactElement }) => (
  <Dialog>
    <DialogTrigger render={trigger} />
    <DialogPopup className="sm:max-w-lg">
      <ContactForm {...(contact && { contact })} />
    </DialogPopup>
  </Dialog>
)

// Ready to paste into a message or a document.
const lineOf = (c: Contact) =>
  [c.name, c.title, c.company, c.email, c.phone].filter(Boolean).join(", ")

export const CopyButton = ({ text, label }: { text: string; label: string }) => {
  // A browser can refuse, and an action that throws takes the whole page down with it.
  const [result, copy] = useActionState(
    () =>
      navigator.clipboard.writeText(text).then(
        () => "Copied",
        () => "Couldn't copy"
      ),
    "Copy"
  )
  return (
    <Button
      size="xs"
      variant="ghost"
      aria-label={`${label}: ${text}`}
      onClick={() => startTransition(copy)}
    >
      {result}
    </Button>
  )
}

const Row = ({ contact, main }: { contact: Contact; main: boolean }) => {
  const remove = useMutation(api.contacts.remove)
  return (
    <TableRow>
      <TableCell className="font-medium">
        {contact.applicationId ? (
          <Link
            to="/"
            search={{ app: contact.applicationId }}
            className="hover:underline underline-offset-2"
          >
            {contact.company}
          </Link>
        ) : (
          contact.company
        )}
      </TableCell>
      <TableCell>
        <span className="flex items-center gap-1.5">
          {contact.name}
          {main && (
            <Badge variant="secondary" size="sm" className="font-normal">
              Main
            </Badge>
          )}
        </span>
        {contact.title && (
          <span className="text-muted-foreground block text-xs">{contact.title}</span>
        )}
      </TableCell>
      <TableCell>{contact.email}</TableCell>
      <TableCell>{contact.phone}</TableCell>
      <TableCell className="text-muted-foreground tabular-nums">{contact.count}</TableCell>
      <TableCell className="text-muted-foreground max-w-48 truncate" title={contact.notes}>
        {contact.notes}
      </TableCell>
      <TableCell>
        <span className="flex justify-end">
          <CopyButton text={lineOf(contact)} label="Copy contact" />
          <EditContact
            contact={contact}
            trigger={
              <Button size="xs" variant="ghost">
                Edit
              </Button>
            }
          />
          <Button
            size="xs"
            variant="ghost"
            onClick={() => {
              if (window.confirm(`Remove ${contact.name || contact.email}?`))
                void remove({ id: contact.id })
            }}
          >
            Remove
          </Button>
        </span>
      </TableCell>
    </TableRow>
  )
}

// People you've dealt with, by company. Mail fills it in, and you can change anything.
export const Contacts = () => {
  const contacts = useQuery(api.contacts.list)
  return (
    <div className="soft-theme bg-background text-foreground flex h-svh flex-col rounded-[inherit] md:h-[calc(100svh-1rem)]">
      <PageHeader crumbs={[{ label: "Contacts" }]} />
      <ScrollArea className="min-h-0 flex-1">
        <main className={pageBody}>
          <PageIntro
            title="Contacts"
            description="People from the mail on your applications, by company. Automated senders are left out, and Main is who you've traded the most email with."
          >
            <EditContact trigger={<Button size="sm">Add a contact</Button>} />
          </PageIntro>
          {contacts?.length === 0 && (
            <p className="text-muted-foreground text-[13px]">
              Nobody yet. People appear here when mail lands on an application, or add one yourself.
            </p>
          )}
          {contacts && contacts.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Company</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Emails</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead>
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contacts.map((c, i) => (
                  <Row
                    key={c.id}
                    contact={c}
                    main={c.count > 0 && contacts[i - 1]?.company !== c.company}
                  />
                ))}
              </TableBody>
            </Table>
          )}
        </main>
      </ScrollArea>
    </div>
  )
}
