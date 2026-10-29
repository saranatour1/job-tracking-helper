import { ConvexError } from "convex/values"

import { Label } from "@/components/ui/label"

export const messageOf = (error: unknown) =>
  error instanceof ConvexError && typeof error.data === "string"
    ? error.data
    : "Something went wrong. Try again."

// A titled group of rows on one card, like a settings page.
export const Section = ({
  title,
  status,
  children,
}: {
  title: string
  status?: React.ReactNode
  children: React.ReactNode
}) => (
  <section className="flex flex-col gap-3">
    <div className="flex items-center justify-between gap-2 px-1">
      <h3 className="font-heading font-medium">{title}</h3>
      {status}
    </div>
    <div className="bg-card divide-y rounded-xl border">{children}</div>
  </section>
)

// A setting's name and what it does on the left, its control on the right. On narrow
// screens the control wraps under the text.
export const Row = ({
  label,
  description,
  htmlFor,
  children,
}: {
  label: string
  description: React.ReactNode
  htmlFor?: string
  children: React.ReactNode
}) => (
  <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3">
    <div className="grid min-w-48 flex-1 gap-0.5">
      {htmlFor ? (
        <Label htmlFor={htmlFor}>{label}</Label>
      ) : (
        <span className="text-sm font-medium">{label}</span>
      )}
      <p className="text-muted-foreground text-xs">{description}</p>
    </div>
    <div className="flex w-full items-center justify-end gap-2 sm:w-auto">{children}</div>
  </div>
)
