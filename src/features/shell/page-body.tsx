import { cn } from "@/lib/utils"

// The style every content page and tab shares: an intro with the page's title and
// what it's for, then dashed tiles that group things. A solid chip names each tile,
// and dashed chips add things. Tool pages like Pipeline keep their full-width lists.

/** The centered column a content page or tab sits in. */
export const pageBody = "mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-10"

/** Tiles side by side on wider screens; add `md:col-span-2` to a big one. */
export const tileGrid = "grid grid-flow-dense gap-3 md:grid-cols-2"

/** A tile's name. Also used on inputs, so renaming a tile looks the same. */
export const chip = "bg-muted/40 rounded-lg border px-2 py-1 text-[13px] font-medium"

/** A small dashed button that adds something, like a field. */
export const addChip =
  "text-muted-foreground hover:bg-accent/30 hover:text-foreground flex h-7 shrink-0 items-center gap-1 rounded-lg border border-dashed px-2 text-xs transition-colors disabled:opacity-50"

/** A whole dashed tile that adds something, like a section. */
export const addTile =
  "text-muted-foreground hover:bg-accent/30 hover:text-foreground flex min-h-24 items-center justify-center gap-2 rounded-xl border border-dashed text-sm transition-colors disabled:opacity-50"

export const PageIntro = ({
  title,
  description,
  children,
}: {
  title: string
  description?: React.ReactNode
  children?: React.ReactNode
}) => (
  <div className="flex flex-col gap-1">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="font-heading text-2xl font-semibold">{title}</h2>
      {children}
    </div>
    {description && <p className="text-muted-foreground text-sm leading-relaxed">{description}</p>}
  </div>
)

/** A dashed group. `title` is a string for a fixed name, or a node such as an input chip. */
export const Tile = ({
  title,
  actions,
  className,
  children,
}: {
  title?: React.ReactNode
  actions?: React.ReactNode
  className?: string
  children: React.ReactNode
}) => (
  <section className={cn("flex flex-col gap-2 rounded-xl border border-dashed p-3", className)}>
    {(title || actions) && (
      <div className="flex items-start gap-1">
        {typeof title === "string" ? <h3 className={cn(chip, "me-auto")}>{title}</h3> : title}
        {actions}
      </div>
    )}
    {children}
  </section>
)
