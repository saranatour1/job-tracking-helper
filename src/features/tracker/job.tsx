import { api } from "@convex/_generated/api"
import type { Id } from "@convex/_generated/dataModel"
import { LinkSquare02Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useQuery } from "convex-helpers/react/cache/hooks"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Breakdown } from "@/features/loops/shortlist"

import type { Application } from "./data"
import { useSource } from "./source"

// What we know about the job itself: the link, and for one a loop found or Jev checked,
// how well it fits, why, line by line, and the posting. Sample applications have none.
export const JobContext = ({ a }: { a: Application }) => {
  const { real } = useSource()
  const data = useQuery(
    api.loops.leadForApplication,
    real ? { applicationId: a.id as Id<"applications"> } : "skip"
  )
  if (!real || data === undefined) return null
  const lead = data?.lead
  const url = a.url ?? lead?.url
  if (!lead && !url) return null
  return (
    <section aria-label="Job" className="flex flex-col gap-3 border-t pt-6">
      <div className="flex items-center gap-2">
        <h3 className="text-[13px] font-medium">Job</h3>
        {url && (
          <Button
            size="xs"
            variant="ghost"
            className="ms-auto"
            render={<a href={url} target="_blank" rel="noreferrer" />}
          >
            <HugeiconsIcon icon={LinkSquare02Icon} /> Posting
          </Button>
        )}
      </div>
      {lead ? (
        <>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Badge
              variant={lead.verdict === "notFit" ? "outline" : "success"}
              className="font-normal"
            >
              {lead.fit}% · {lead.verdict === "notFit" ? "Not a fit" : "A fit for you"}
            </Badge>
            <span className="text-muted-foreground">
              {data.loopName ? `Found by ${data.loopName}` : "You pasted this link"}
            </span>
          </div>
          <p className="text-[13px] leading-relaxed">{lead.reasons.join(" ")}</p>
          {lead.checks?.length ? <Breakdown checks={lead.checks} /> : null}
          {/* Folded, so a long posting doesn't push the timeline away. */}
          <details className="group text-[13px]">
            <summary className="text-muted-foreground hover:text-foreground cursor-pointer text-xs">
              The posting
            </summary>
            <p className="mt-2 leading-relaxed whitespace-pre-line">{data.text}</p>
          </details>
        </>
      ) : (
        <p className="text-muted-foreground text-xs">
          Added by hand. Paste its link under Loops to have Jev check how it fits.
        </p>
      )}
    </section>
  )
}
