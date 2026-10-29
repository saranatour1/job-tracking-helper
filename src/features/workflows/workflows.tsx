import { api } from "@convex/_generated/api"
import type { Doc } from "@convex/_generated/dataModel"
import { Link } from "@tanstack/react-router"
import { useMutation } from "convex/react"
import { useQuery } from "convex-helpers/react/cache/hooks"

import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Switch } from "@/components/ui/switch"
import { Section } from "@/features/account/settings"
import { PageHeader } from "@/features/shell/page-header"
import { PageIntro, pageBody } from "@/features/shell/page-body"
import { cn } from "@/lib/utils"

import { triggerInfo } from "./blocks"

const Row = ({ automation }: { automation: Doc<"automations"> }) => {
  const counts = useQuery(api.automations.counts, { automationId: automation._id })
  const setActive = useMutation(api.automations.setActive)
  const runNow = useMutation(api.automations.runNow)
  const steps = automation.steps.length
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3">
      <Link
        to="/workflows/$id"
        params={{ id: automation._id }}
        className="grid min-w-48 flex-1 gap-0.5 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="text-sm font-medium hover:underline">{automation.name}</span>
        <span className="text-muted-foreground text-xs">
          {triggerInfo(automation.trigger).summary} · {steps} {steps === 1 ? "step" : "steps"}
          {counts && counts.done + counts.failed > 0 && (
            <>
              {" · "}
              {counts.done} done
              <span className={cn(counts.failed > 0 && "text-destructive")}>
                , {counts.failed} failed
              </span>
            </>
          )}
        </span>
      </Link>
      <div className="flex items-center gap-2">
        <Switch
          aria-label={automation.active ? "Turn off" : "Turn on"}
          checked={automation.active}
          onCheckedChange={(active) => void setActive({ id: automation._id, active })}
        />
        <Button size="sm" variant="outline" onClick={() => void runNow({ id: automation._id })}>
          Run now
        </Button>
      </div>
    </div>
  )
}

// Workflows you build from blocks: what starts each one, and how its runs went.
export const Workflows = () => {
  const automations = useQuery(api.automations.list)
  return (
    <div className="flex h-svh flex-col md:h-[calc(100svh-1rem)]">
      <PageHeader
        crumbs={[{ label: "Workflows" }]}
        actions={
          <Button size="sm" render={<Link to="/workflows/$id" params={{ id: "new" }} />}>
            New workflow
          </Button>
        }
      />
      <ScrollArea className="min-h-0 flex-1">
        <main className={cn(pageBody, "max-w-3xl gap-8")}>
          <PageIntro
            title="Workflows"
            description="Steps that run for you: on a schedule or when you press Run now. Build one from blocks; it never runs code."
          />
          {automations && (
            <Section title="Yours">
              {automations.length === 0 ? (
                <p className="text-muted-foreground px-4 py-3 text-sm">
                  No workflows yet. Start one with New workflow.
                </p>
              ) : (
                automations.map((a) => <Row key={a._id} automation={a} />)
              )}
            </Section>
          )}
        </main>
      </ScrollArea>
    </div>
  )
}
