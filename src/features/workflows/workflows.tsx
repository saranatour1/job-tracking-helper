import { api } from "@convex/_generated/api"
import type { Doc } from "@convex/_generated/dataModel"
import { blocksOf } from "@convex/api/features/automations/validators"
import { Link, useNavigate } from "@tanstack/react-router"
import { useMutation } from "convex/react"
import { useQuery } from "convex-helpers/react/cache/hooks"
import { startTransition, useActionState } from "react"

import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Switch } from "@/components/ui/switch"
import { messageOf, Section } from "@/features/account/settings"
import { PageHeader } from "@/features/shell/page-header"
import { PageIntro, pageBody } from "@/features/shell/page-body"
import { cn } from "@/lib/utils"

import { triggerInfo } from "./blocks"

const Row = ({ automation }: { automation: Doc<"automations"> }) => {
  const counts = useQuery(api.automations.counts, { automationId: automation._id })
  // The switch moves at once; the list catches up when the server answers.
  const setActive = useMutation(api.automations.setActive).withOptimisticUpdate(
    (store, { id, active }) => {
      const list = store.getQuery(api.automations.list, {})
      if (list)
        store.setQuery(
          api.automations.list,
          {},
          list.map((a) => (a._id === id ? { ...a, active } : a))
        )
    }
  )
  const runNow = useMutation(api.automations.runNow)
  const navigate = useNavigate()
  // What went wrong last, shown under the row: a rate limit, say.
  const [error, act] = useActionState(
    async (_: string | undefined, action: { run: true } | { active: boolean }) => {
      try {
        if ("run" in action) {
          const runId = await runNow({ id: automation._id })
          void navigate({
            to: "/workflows/$id",
            params: { id: automation._id },
            search: { tab: "history", run: runId },
          })
        } else await setActive({ id: automation._id, active: action.active })
        return undefined
      } catch (cause) {
        return messageOf(cause)
      }
    },
    undefined
  )
  const steps = blocksOf(automation.steps).length
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
          onCheckedChange={(active) => startTransition(() => act({ active }))}
        />
        <Button
          size="sm"
          variant="outline"
          onClick={() => startTransition(() => act({ run: true }))}
        >
          Run now
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-destructive w-full text-xs">
          {error}
        </p>
      )}
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
