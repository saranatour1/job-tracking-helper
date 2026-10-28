import { useAuthActions } from "@convex-dev/auth/react"
import { api } from "@convex/_generated/api"
import type { Id } from "@convex/_generated/dataModel"
import { maxImageBytes, Profile } from "@convex/api/features/users/validators"
import { useForm } from "@tanstack/react-form"
import type { FunctionReturnType } from "convex/server"
import { ConvexError } from "convex/values"
import { useMutation, useQuery } from "convex/react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PageHeader } from "@/features/shell/page-header"

const fields = [
  { name: "name", label: "Name", type: "text", autoComplete: "name" },
  { name: "email", label: "Email", type: "email", autoComplete: "email" },
  { name: "userName", label: "Username", type: "text", autoComplete: "username" },
] as const

const messageOf = (error: unknown) =>
  error instanceof ConvexError && typeof error.data === "string"
    ? error.data
    : "Something went wrong. Try again."

const ProfileForm = ({ profile }: { profile: typeof Profile.inferIn }) => {
  const updateProfile = useMutation(api.users.updateProfile)
  const [status, setStatus] = useState<string>()
  const form = useForm({
    defaultValues: profile,
    validators: { onSubmit: Profile },
    onSubmit: async ({ value }) => {
      setStatus(undefined)
      await updateProfile(value).then(
        () => setStatus("Saved."),
        (error: unknown) => setStatus(messageOf(error))
      )
    },
  })

  return (
    <form
      noValidate
      className="grid max-w-sm gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        void form.handleSubmit()
      }}
    >
      {fields.map(({ name, label, type, autoComplete }) => (
        <form.Field key={name} name={name}>
          {(field) => (
            <div className="grid gap-1.5">
              <Label htmlFor={name}>{label}</Label>
              <Input
                id={name}
                type={type}
                autoComplete={autoComplete}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
                aria-invalid={field.state.meta.errors.length > 0}
              />
              {field.state.meta.errors.map((error) => (
                <p key={error?.message} className="text-destructive text-xs">
                  {error?.message}
                </p>
              ))}
            </div>
          )}
        </form.Field>
      ))}
      {status && (
        <p role="status" className="text-sm">
          {status}
        </p>
      )}
      <Button type="submit" className="justify-self-start">
        Save
      </Button>
    </form>
  )
}

const ProfileImage = ({ imageUrl }: { imageUrl: string | null }) => {
  const generateUploadUrl = useMutation(api.users.generateImageUploadUrl)
  const setImage = useMutation(api.users.setImage)
  const [error, setError] = useState<string>()

  const upload = async (file: File) => {
    // The server checks too; this keeps an obviously wrong file out of storage.
    if (!file.type.startsWith("image/")) return setError("Upload an image file.")
    if (file.size > maxImageBytes) return setError("Images must be 5 MB or smaller.")
    const response = await fetch(await generateUploadUrl(), {
      method: "POST",
      headers: { "Content-Type": file.type },
      body: file,
    })
    const { storageId } = (await response.json()) as { storageId: Id<"_storage"> }
    await setImage({ imageId: storageId })
  }

  return (
    <div className="flex items-center gap-4">
      {imageUrl ? (
        <img src={imageUrl} alt="Profile" className="size-16 rounded-full object-cover" />
      ) : (
        <div aria-label="No profile image" className="bg-muted size-16 rounded-full" />
      )}
      <div className="grid gap-1.5">
        <Label htmlFor="image">Profile image</Label>
        <Input
          id="image"
          type="file"
          accept="image/*"
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
      {imageUrl && (
        <Button type="button" variant="outline" onClick={() => void setImage({})}>
          Remove
        </Button>
      )}
    </div>
  )
}

const DeleteAccount = () => {
  const deleteAccount = useMutation(api.users.deleteAccount)
  const { signOut } = useAuthActions()

  return (
    <section className="grid max-w-sm gap-2">
      <h2 className="font-heading font-medium">Delete account</h2>
      <p className="text-muted-foreground text-sm">
        Deletes your applications, profile and image, frees your sign-in username, and signs you
        out.
      </p>
      <Button
        type="button"
        variant="destructive"
        className="justify-self-start"
        onClick={async () => {
          if (!window.confirm("Delete your account? This can't be undone.")) return
          await deleteAccount()
          await signOut()
        }}
      >
        Delete account
      </Button>
    </section>
  )
}

const AccountBody = ({ me }: { me: FunctionReturnType<typeof api.users.me> }) => {
  const { imageUrl, ...profile } = me
  return (
    <>
      <ProfileImage imageUrl={imageUrl} />
      <ProfileForm profile={profile} />
      <DeleteAccount />
    </>
  )
}

export const Account = () => {
  const me = useQuery(api.users.me)
  return (
    <>
      <PageHeader crumbs={[{ label: "Account" }]} />
      <main className="flex flex-col gap-8 p-6">{me && <AccountBody me={me} />}</main>
    </>
  )
}
