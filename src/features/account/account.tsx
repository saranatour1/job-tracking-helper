import { useAuthActions } from "@convex-dev/auth/react"
import { api } from "@convex/_generated/api"
import type { Id } from "@convex/_generated/dataModel"
import { maxImageBytes, Profile } from "@convex/features/users/validators"
import { useForm } from "@tanstack/react-form"
import type { FunctionReturnType } from "convex/server"
import { useMutation } from "convex/react"
import { useQuery } from "convex-helpers/react/cache/hooks"
import { startTransition, useActionState, useRef } from "react"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { EmailSection } from "@/features/account/email"
import { NotificationsSection } from "@/features/account/notifications"
import { messageOf, Row, Section } from "@/features/account/settings"
import { BookingSection } from "@/features/booking/pages-section"
import { CalendarSection } from "@/features/calendar/settings"
import { PageIntro, pageBody } from "@/features/shell/page-body"
import { PageHeader } from "@/features/shell/page-header"
import { ThemeSwitch } from "@/features/shell/theme"
import { cn } from "@/lib/utils"

type Me = FunctionReturnType<typeof api.users.me>

const fields = [
  {
    name: "name",
    label: "Full name",
    description: "Shown in the sidebar and on your applications.",
    type: "text",
    autoComplete: "name",
  },
  {
    name: "userName",
    label: "Username",
    description: "What you sign in with.",
    type: "text",
    autoComplete: "username",
  },
  {
    name: "email",
    label: "Email",
    description: "Where application forms can reach you.",
    type: "email",
    autoComplete: "email",
  },
] as const

const initialsOf = (me: Me) =>
  (me.name || me.userName || "Guest")
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join("")

const ProfileImage = ({ me }: { me: Me }) => {
  const generateUploadUrl = useMutation(api.users.generateUploadUrl)
  const setImage = useMutation(api.users.setImage)
  const picker = useRef<HTMLInputElement>(null)
  // The upload's result is the error under the picture, if there is one.
  const [error, upload] = useActionState(async (_: string | undefined, file: File) => {
    // The server checks too; this keeps an obviously wrong file out of storage.
    if (!file.type.startsWith("image/")) return "Upload an image file."
    if (file.size > maxImageBytes) return "Images must be 5 MB or smaller."
    try {
      const response = await fetch(await generateUploadUrl(), {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      })
      const { storageId } = (await response.json()) as { storageId: Id<"_storage"> }
      await setImage({ imageId: storageId })
    } catch (cause) {
      return messageOf(cause)
    }
  }, undefined)

  return (
    <Row
      label="Profile picture"
      description={
        error ? (
          <span role="alert" className="text-destructive">
            {error}
          </span>
        ) : (
          "An image up to 5 MB."
        )
      }
    >
      <Avatar className="size-9">
        {me.imageUrl && <AvatarImage src={me.imageUrl} alt="Profile" />}
        <AvatarFallback>{initialsOf(me)}</AvatarFallback>
      </Avatar>
      <input
        ref={picker}
        type="file"
        accept="image/*"
        aria-label="Profile picture"
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ""
          if (file) startTransition(() => upload(file))
        }}
      />
      <Button type="button" size="sm" variant="outline" onClick={() => picker.current?.click()}>
        {me.imageUrl ? "Change" : "Upload"}
      </Button>
      {me.imageUrl && (
        <Button type="button" size="sm" variant="ghost" onClick={() => void setImage({})}>
          Remove
        </Button>
      )}
    </Row>
  )
}

// Each field saves when you leave it, so there's no Save button to forget.
const ProfileSection = ({ me }: { me: Me }) => {
  const updateProfile = useMutation(api.users.updateProfile)
  const [status, save] = useActionState(
    (_: string | undefined, value: typeof Profile.inferIn) =>
      updateProfile(value).then(() => "Saved", messageOf),
    undefined
  )
  const profile = { name: me.name, email: me.email, userName: me.userName }
  const form = useForm({
    defaultValues: profile,
    validators: { onSubmit: Profile },
    onSubmit: ({ value }) => startTransition(() => save(value)),
  })

  return (
    <Section
      title="Profile"
      status={
        // Hidden while a field is invalid, so an old "Saved" doesn't cover an unsaved edit.
        <form.Subscribe selector={(s) => s.isValid}>
          {(isValid) =>
            isValid &&
            status && (
              <p
                role="status"
                className={cn(
                  "text-xs",
                  status === "Saved" ? "text-muted-foreground" : "text-destructive"
                )}
              >
                {status}
              </p>
            )
          }
        </form.Subscribe>
      }
    >
      <ProfileImage me={me} />
      <form
        noValidate
        className="divide-y"
        onSubmit={(e) => {
          e.preventDefault()
          void form.handleSubmit()
        }}
      >
        {fields.map(({ name, label, description, type, autoComplete }) => (
          <form.Field key={name} name={name}>
            {(field) => (
              <Row
                label={label}
                htmlFor={name}
                description={
                  field.state.meta.errors.length ? (
                    <span className="text-destructive">{field.state.meta.errors[0]?.message}</span>
                  ) : (
                    description
                  )
                }
              >
                <Input
                  id={name}
                  type={type}
                  autoComplete={autoComplete}
                  className="sm:w-64"
                  value={field.state.value}
                  onBlur={() => {
                    field.handleBlur()
                    if (field.state.value !== profile[name]) void form.handleSubmit()
                  }}
                  onChange={(e) => field.handleChange(e.target.value)}
                  aria-invalid={field.state.meta.errors.length > 0}
                />
              </Row>
            )}
          </form.Field>
        ))}
        {/* Lets Enter save from any field. */}
        <button type="submit" hidden />
      </form>
    </Section>
  )
}

const trashChoices = [
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
  { value: "180", label: "180 days" },
  { value: "365", label: "A year" },
  { value: "0", label: "Never" },
]

// How long the Trash keeps applications before deleting them for good.
const ApplicationsSection = () => {
  const settings = useQuery(api.applications.trashSettings)
  const setTrashDays = useMutation(api.applications.setTrashDays).withOptimisticUpdate(
    (store, { days }) => {
      const now = store.getQuery(api.applications.trashSettings, {})
      if (now) store.setQuery(api.applications.trashSettings, {}, { ...now, trashDays: days })
    }
  )
  if (!settings) return null
  return (
    <Section title="Applications">
      <Row
        label="Empty the Trash after"
        description={`Applications in the Trash are deleted for good after this long. Archived ones move to the Trash after ${settings.archiveDays} days.`}
      >
        <Select
          value={String(settings.trashDays)}
          items={trashChoices}
          onValueChange={(v) => v !== null && void setTrashDays({ days: Number(v) })}
        >
          <SelectTrigger size="sm" aria-label="Empty the Trash after" className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectPopup>
            {trashChoices.map((c) => (
              <SelectItem key={c.value} value={c.value}>
                {c.label}
              </SelectItem>
            ))}
          </SelectPopup>
        </Select>
      </Row>
    </Section>
  )
}

// The switch that lets the app submit applications for you, from the Jobs page.
const AutoApplySection = () => {
  const settings = useQuery(api.autoApply.settings)
  const setSwitch = useMutation(api.autoApply.setSwitch)
  return (
    <Section title="Auto-apply">
      <Row
        label="Apply for me"
        description={
          <>
            With this on, <strong>Auto-apply</strong> on a role in Jobs fills the posting's form
            from your saved answers and resume and submits it. Only Greenhouse, Lever, Ashby and
            Personio forms that need no account; a question with no saved answer stops it as Needs
            you, and required consent boxes are ticked for you. 10 a day. Each run shows on the
            Activity page.
            {settings && !settings.ready && !settings.on && (
              <>
                {" "}
                Needs a resume on the Resume page, your email under Profile, and a Firecrawl key.
              </>
            )}
          </>
        }
      >
        <Switch
          aria-label="Apply for me"
          checked={settings?.on ?? false}
          disabled={!settings}
          onCheckedChange={(on) => void setSwitch({ on })}
        />
      </Row>
      <Row
        label="Fill, but don't send yet"
        description="Each run fills the form and shows on Activity what it would use, then stops before Submit. Turn it off once you're happy with the answers."
      >
        <Switch
          aria-label="Fill, but don't send yet"
          checked={settings?.dryRun ?? false}
          disabled={!settings}
          onCheckedChange={(dryRun) => void setSwitch({ dryRun })}
        />
      </Row>
    </Section>
  )
}

const AccountSection = () => {
  const deleteAccount = useMutation(api.users.deleteAccount)
  const { signOut } = useAuthActions()

  return (
    <Section title="Account">
      <Row label="Sign out" description="Sign out of Job Tracking Helper on this device.">
        <Button type="button" size="sm" variant="outline" onClick={() => void signOut()}>
          Sign out
        </Button>
      </Row>
      <Row
        label="Delete account"
        description="Deletes your applications, preferences, loops, profile and picture, frees your username, and signs you out."
      >
        <Button
          type="button"
          size="sm"
          variant="destructive"
          onClick={async () => {
            if (!window.confirm("Delete your account? This can't be undone.")) return
            await deleteAccount()
            await signOut()
          }}
        >
          Delete account
        </Button>
      </Row>
    </Section>
  )
}

export const Account = () => {
  const me = useQuery(api.users.me)
  return (
    // As tall as the inset, so the page scrolls inside it instead of moving the whole window.
    <div className="flex h-svh flex-col md:h-[calc(100svh-1rem)]">
      <PageHeader crumbs={[{ label: "Account" }]} />
      <ScrollArea className="min-h-0 flex-1">
        <main className={cn(pageBody, "max-w-2xl gap-10")}>
          <PageIntro
            title="Account"
            description="Your profile, email, notifications, calendar, booking pages, how the app looks, and your sign-in."
          />
          {me && <ProfileSection me={me} />}
          <EmailSection />
          <NotificationsSection />
          <CalendarSection />
          <BookingSection />
          <ApplicationsSection />
          <AutoApplySection />
          <Section title="Interface and theme">
            <Row label="Theme" description="Light, dark, or follow your system.">
              <div className="w-32">
                <ThemeSwitch />
              </div>
            </Row>
          </Section>
          <AccountSection />
        </main>
      </ScrollArea>
    </div>
  )
}
