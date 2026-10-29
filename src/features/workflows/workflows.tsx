import { api } from "@convex/_generated/api"
import type { Doc } from "@convex/_generated/dataModel"
import { blocksOf } from "@convex/api/features/automations/validators"
import { Link, useNavigate } from "@tanstack/react-router"
import { useAction, useMutation } from "convex/react"
import { useQuery } from "convex-helpers/react/cache/hooks"
import { startTransition, useActionState } from "react"

import { Button } from "@/components/ui/button"
import {
  Menu,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuPopup,
  MenuSeparator,
  MenuTrigger,
} from "@/components/ui/menu"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { messageOf, Section } from "@/features/account/settings"
import { PageHeader } from "@/features/shell/page-header"
import { PageIntro, pageBody } from "@/features/shell/page-body"
import { cn } from "@/lib/utils"

import { triggerInfo } from "./blocks"
import { templateNames, templates } from "./templates"

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

const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone

const Describe = () => {
  const describe = useAction(api.automations.describe)
  const navigate = useNavigate()
  const [error, draft, drafting] = useActionState(async (_: string | undefined, form: FormData) => {
    try {
      const said = form.get("request")
      const request = typeof said === "string" ? said : ""
      const draft = await describe({ request, zone: browserZone })
      void navigate({ to: "/workflows/$id", params: { id: "new" }, search: { draft } })
      return undefined
    } catch (cause) {
      return messageOf(cause)
    }
  }, undefined)
  return (
    <Section title="Describe one">
      <form action={draft} className="grid gap-2 px-4 py-3">
        <Textarea
          name="request"
          rows={2}
          maxLength={300}
          aria-label="What should the workflow do?"
          placeholder="When an interview email comes in, move it to Interviewing and put prep time on my calendar the next day."
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-muted-foreground text-xs">
            Jev drafts it from the blocks; you check it before it's saved.
          </p>
          <Button size="sm" type="submit" disabled={drafting}>
            {drafting ? "Drafting…" : "Draft it"}
          </Button>
        </div>
        {error && (
          <p role="alert" className="text-destructive text-xs">
            {error}
          </p>
        )}
      </form>
    </Section>
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
          <Menu>
            <MenuTrigger render={<Button size="sm" />}>New workflow</MenuTrigger>
            <MenuPopup align="end" className="max-h-[70svh] w-80 overflow-y-auto">
              <MenuItem render={<Link to="/workflows/$id" params={{ id: "new" }} />}>
                Start from scratch
              </MenuItem>
              {[...new Set(templateNames.map((name) => templates[name].group))].map((group) => (
                <MenuGroup key={group}>
                  <MenuSeparator />
                  <MenuGroupLabel>{group}</MenuGroupLabel>
                  {templateNames
                    .filter((name) => templates[name].group === group)
                    .map((name) => (
                      <MenuItem
                        key={name}
                        render={
                          <Link
                            to="/workflows/$id"
                            params={{ id: "new" }}
                            search={{ template: name }}
                          />
                        }
                      >
                        <span className="flex flex-col">
                          <span>{templates[name].label}</span>
                          <span className="text-muted-foreground text-xs">
                            {templates[name].hint}
                          </span>
                        </span>
                      </MenuItem>
                    ))}
                </MenuGroup>
              ))}
            </MenuPopup>
          </Menu>
        }
      />
      <ScrollArea className="min-h-0 flex-1">
        <main className={cn(pageBody, "max-w-3xl gap-8")}>
          <PageIntro
            title="Workflows"
            description="Steps that run for you: on a schedule, when an email or a booking comes in, when an application moves, or when you press Run now. Build one from blocks, or start from a template; it never runs code."
          />
          <Describe />
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
