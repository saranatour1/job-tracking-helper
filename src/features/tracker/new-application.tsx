import { api } from "@convex/_generated/api"
import { useMutation } from "convex/react"
import { ConvexError } from "convex/values"
import { useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogCreateHandle,
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
import { Textarea } from "@/components/ui/textarea"

const fields = [
  ["role", "Role", "Frontend Engineer"],
  ["company", "Company", "Stripe"],
  ["url", "Posting link", "https://"],
] as const

// Adds a real application as applied. The notes become its description.
export const NewApplicationDialog = ({ trigger }: { trigger: React.ReactElement }) => {
  const add = useMutation(api.applications.add)
  const handle = useRef(DialogCreateHandle()).current
  const [error, setError] = useState<string>()

  const submit = async (form: HTMLFormElement) => {
    const value = (name: string) => {
      const entry = new FormData(form).get(name)
      return typeof entry === "string" ? entry.trim() : ""
    }
    if (!value("role") || !value("company")) return setError("Add a role and a company.")
    setError(undefined)
    try {
      await add({
        role: value("role"),
        company: value("company"),
        status: "applied",
        ...(value("url") && { url: value("url") }),
        ...(value("notes") && { description: value("notes") }),
      })
      form.reset()
      handle.close()
    } catch (cause) {
      setError(
        cause instanceof ConvexError ? String(cause.data) : "Something went wrong. Try again."
      )
    }
  }

  return (
    <Dialog handle={handle}>
      <DialogTrigger render={trigger} />
      <DialogPopup className="sm:max-w-lg">
        <form
          className="contents"
          onSubmit={(e) => {
            e.preventDefault()
            void submit(e.currentTarget)
          }}
        >
          <DialogHeader>
            <DialogTitle>New application</DialogTitle>
            <DialogDescription>Add a role you applied to.</DialogDescription>
          </DialogHeader>
          <DialogPanel className="grid gap-4">
            {fields.map(([id, label, placeholder]) => (
              <div key={id} className="grid gap-1.5">
                <Label htmlFor={`new-${id}`}>{label}</Label>
                <Input id={`new-${id}`} name={id} placeholder={placeholder} />
              </div>
            ))}
            <div className="grid gap-1.5">
              <Label htmlFor="new-notes">Notes</Label>
              <Textarea
                id="new-notes"
                name="notes"
                placeholder="Anything to remember about this role…"
              />
            </div>
            {error && (
              <p role="alert" className="text-destructive text-sm">
                {error}
              </p>
            )}
          </DialogPanel>
          <DialogFooter>
            <DialogClose render={<Button variant="ghost" />}>Cancel</DialogClose>
            <Button type="submit">Create application</Button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  )
}
