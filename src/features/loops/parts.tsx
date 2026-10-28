import type { PlayIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { ConvexError } from "convex/values"

import { Button } from "@/components/ui/button"
import { Tooltip, TooltipPopup, TooltipTrigger } from "@/components/ui/tooltip"

// Small pieces the Loops page and its shortlist share.

export const messageOf = (error: unknown) =>
  error instanceof ConvexError && typeof error.data === "string"
    ? error.data
    : "Something went wrong. Try again."

export const Status = ({ text }: { text: string | undefined }) =>
  text ? (
    <p role="status" className="text-muted-foreground px-1 text-xs">
      {text}
    </p>
  ) : null

// An icon button named by its tooltip.
export const IconAction = ({
  label,
  icon,
  ...props
}: { label: string; icon: typeof PlayIcon } & React.ComponentProps<typeof Button>) => (
  <Tooltip>
    <TooltipTrigger
      render={<Button variant="ghost" size="icon-sm" aria-label={label} {...props} />}
    >
      <HugeiconsIcon icon={icon} />
    </TooltipTrigger>
    <TooltipPopup>{label}</TooltipPopup>
  </Tooltip>
)
