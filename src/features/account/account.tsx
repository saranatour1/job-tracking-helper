import { useAuthActions } from "@convex-dev/auth/react"
import { api } from "@convex/_generated/api"
import type { Id } from "@convex/_generated/dataModel"
import { maxImageBytes, Profile } from "@convex/api/features/users/validators"
import { useForm } from "@tanstack/react-form"
import type { FunctionReturnType } from "convex/server"
import { useMutation, useQuery } from "convex/react"
import { startTransition, useActionState, useRef } from "react"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { EmailSection } from "@/features/account/email"
import { messageOf, Row, Section } from "@/features/account/settings"
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
            description="Your profile, your email, how the app looks, and your sign-in."
          />
          {me && <ProfileSection me={me} />}
          <EmailSection />
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
