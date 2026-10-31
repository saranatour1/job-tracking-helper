import { api } from "@convex/_generated/api"
import type { Doc, Id } from "@convex/_generated/dataModel"
import { Link } from "@tanstack/react-router"
import { useAction, useMutation } from "convex/react"
import { useQuery } from "convex-helpers/react/cache/hooks"
import { startTransition, useActionState } from "react"

import { ArrowLeft01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { messageOf } from "@/features/account/settings"
import { Breakdown } from "@/features/loops/shortlist"
import { cn } from "@/lib/utils"
import { PageIntro, pageBody, Tile, tileGrid } from "@/features/shell/page-body"
import { PageHeader } from "@/features/shell/page-header"

type Prefill = Doc<"prefills">
type Field = Prefill["fields"][number]
type Status = Prefill["status"]

export const statusLabels: Record<Status, string> = {
  preparing: "Preparing…",
  needsAnswers: "Needs you",
  ready: "Ready",
  live: "Open",
  applied: "Applied",
  dismissed: "Dismissed",
  failed: "Failed",
}

export const statusVariant: Record<Status, "secondary" | "info" | "warning" | "success" | "error"> =
  {
    preparing: "secondary",
    needsAnswers: "warning",
    ready: "info",
    live: "info",
    applied: "success",
    dismissed: "secondary",
    failed: "error",
  }

// What's waiting on you, in the order the list shows it.
const openOf = <T extends { status: Status }>(rows: T[] | undefined) =>
  (rows ?? []).filter(
    (r) => r.status !== "applied" && r.status !== "dismissed" && r.status !== "failed"
  )

const leftToAnswer = (fields: Field[]) =>
  fields.filter((f) => f.required && (!f.answer || f.source === "ai")).length

const summaryOf = (row: Pick<Prefill, "status" | "fields" | "error">) => {
  if (row.status === "preparing") return "Reading the form and matching your saved answers."
  if (row.status === "failed") return row.error ?? "It couldn't be prepared."
  const left = leftToAnswer(row.fields)
  const answered = row.fields.filter((f) => f.answer && f.source !== "ai").length
  return left
    ? `${answered} answered. ${left} ${left === 1 ? "question needs" : "questions need"} you.`
    : `${answered} of ${row.fields.length} answered, ready for you to check.`
}

// Prepares a role, or shows where it already is. A refusal (no resume, the daily limit)
// shows under the button.
export const PrepareButton = ({
  jobId,
  leadId,
  status,
  prefillId,
}: {
  jobId?: Id<"jobs">
  leadId?: Id<"jobLeads">
  status?: Status
  prefillId?: Id<"prefills">
}) => {
  const prepare = useMutation(api.prefilled.prepare)
  const [error, add] = useActionState(
    () =>
      prepare({ ...(jobId && { jobId }), ...(leadId && { leadId }) }).then(
        () => undefined,
        messageOf
      ),
    undefined
  )
  if (status && prefillId && status !== "failed" && status !== "dismissed")
    return (
      <Badge
        variant={statusVariant[status]}
        className="font-normal"
        render={<Link to="/prefilled/$id" params={{ id: prefillId }} />}
      >
        {statusLabels[status]}
      </Badge>
    )
  return (
    <span className="flex flex-col items-end">
      <Button size="xs" variant="ghost" onClick={() => startTransition(add)}>
        Prepare
      </Button>
      {error && (
        <span role="alert" className="text-destructive max-w-56 text-end text-xs">
          {error}
        </span>
      )}
    </span>
  )
}

// The applications waiting on you, newest first. Finished ones move to Activity.
export const PrefilledList = () => {
  const rows = useQuery(api.prefilled.list)
  const open = openOf(rows)
  return (
    <div className="soft-theme bg-background text-foreground flex h-svh flex-col rounded-[inherit] md:h-[calc(100svh-1rem)]">
      <PageHeader crumbs={[{ label: "Prefilled applications" }]} />
      <ScrollArea className="min-h-0 flex-1">
        <main className={pageBody}>
          <PageIntro
            title="Prefilled applications"
            description="Roles that fit you, with the form read and your saved answers matched. Check one when you have a minute: the app fills it in a browser here, and you press Submit."
          />
          {rows && open.length === 0 && (
            <p className="text-muted-foreground text-[13px]">
              Nothing waiting. Press Prepare on a role in Jobs or your shortlist, or turn on
              preparing new fits under Account.
            </p>
          )}
          <div className={tileGrid}>
            {open.map((row) => (
              <Tile
                key={row._id}
                title={
                  <Link
                    to="/prefilled/$id"
                    params={{ id: row._id }}
                    className="me-auto min-w-0 truncate text-[13px] font-medium hover:underline"
                  >
                    {row.title} · {row.company}
                  </Link>
                }
                actions={
                  <Badge variant={statusVariant[row.status]} className="shrink-0 font-normal">
                    {statusLabels[row.status]}
                  </Badge>
                }
              >
                <p className="text-muted-foreground px-1 text-[13px]">{summaryOf(row)}</p>
              </Tile>
            ))}
          </div>
        </main>
      </ScrollArea>
    </div>
  )
}

const sourceLabel = (field: Field) =>
  field.source === "saved"
    ? "Saved"
    : field.source === "jev"
      ? "Jev picked"
      : field.source === "ai"
        ? "AI draft"
        : field.source === "you"
          ? "You"
          : field.required
            ? "Needs you"
            : "Optional"

// Whether the app got this answer into the open browser.
const FillBadge = ({ field }: { field: Field }) =>
  field.fill === "filled" ? (
    <Badge variant="success" className="shrink-0 font-normal">
      In the form
    </Badge>
  ) : field.fill === "byHand" ? (
    <Badge variant="warning" className="shrink-0 font-normal">
      Do by hand
    </Badge>
  ) : field.answer ? (
    <Badge variant="outline" className="shrink-0 font-normal">
      Not sent yet
    </Badge>
  ) : null

// One question and its answer. Saving it here changes this application only, unless you
// tick Keep for future forms.
const AnswerRow = ({
  id,
  field,
  locked,
  live,
}: {
  id: Id<"prefills">
  field: Field
  locked: boolean
  live: boolean
}) => {
  const setAnswer = useMutation(api.prefilled.setAnswer)
  const sendToForm = useAction(api.prefilled.sendToForm)
  const [error, save, pending] = useActionState(async (_: string | undefined, form: FormData) => {
    const answer = form.get("answer")
    try {
      await setAnswer({
        id,
        question: field.question,
        answer: typeof answer === "string" ? answer : "",
        keep: form.get("keep") === "on",
      })
      if (live) {
        const { filled } = await sendToForm({ id, question: field.question })
        if (answer && !filled) return "It wouldn't go in. Type it in the form."
      }
      return undefined
    } catch (cause) {
      return messageOf(cause)
    }
  }, undefined)
  const items = field.options?.map((o) => ({ value: o, label: o }))
  const draft = field.source === "ai"
  const needed = field.required && (!field.answer || draft)
  return (
    <form action={save} className="flex flex-col gap-1.5 border-t pt-3 first:border-t-0 first:pt-0">
      <div className="flex items-start gap-2">
        <label htmlFor={field.question} className="me-auto text-[13px] font-medium">
          {field.question}
        </label>
        {live && <FillBadge field={field} />}
        <Badge variant={needed ? "warning" : "secondary"} className="shrink-0 font-normal">
          {sourceLabel(field)}
        </Badge>
      </div>
      {items ? (
        <Select name="answer" items={items} defaultValue={field.answer} disabled={locked}>
          <SelectTrigger id={field.question} aria-label={field.question}>
            <SelectValue placeholder="Pick one" />
          </SelectTrigger>
          <SelectPopup>
            {items.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectPopup>
        </Select>
      ) : field.type === "textarea" ? (
        <Textarea
          id={field.question}
          name="answer"
          defaultValue={field.answer}
          maxLength={2000}
          rows={3}
          disabled={locked}
        />
      ) : (
        <Input
          id={field.question}
          name="answer"
          defaultValue={field.answer}
          maxLength={2000}
          disabled={locked}
        />
      )}
      {draft && (
        <p className="text-muted-foreground text-xs">
          Drafted by AI from your resume. Make sure it's true and sounds like you, then{" "}
          {live ? "send it" : "Save"}.
        </p>
      )}
      {!locked && (
        <div className="flex items-center gap-3">
          {field.source !== "saved" && field.source !== "jev" && (
            <label className="text-muted-foreground flex items-center gap-1.5 text-xs">
              <input type="checkbox" name="keep" />
              Keep for future forms
            </label>
          )}
          <Button type="submit" size="xs" variant="outline" className="ms-auto" disabled={pending}>
            {live ? (pending ? "Sending…" : "Send to form") : "Save"}
            {live && <HugeiconsIcon icon={ArrowRight01Icon} className="size-3.5" />}
          </Button>
        </div>
      )}
      {error && (
        <span role="alert" className="text-destructive text-xs">
          {error}
        </span>
      )}
    </form>
  )
}

// The real form, filled, in a browser you control. Nothing is sent until you press its
// Submit; the buttons here only say what happened.
const LiveBrowser = ({ prefill }: { prefill: Prefill }) => {
  const confirm = useAction(api.prefilled.confirmSent)
  const cancel = useAction(api.prefilled.cancelLive)
  type State = { unseen?: boolean; error?: string }
  const [state, act, pending] = useActionState(
    async (_: State, step: "check" | "anyway" | "close"): Promise<State> => {
      try {
        if (step === "close") {
          await cancel({ id: prefill._id })
          return {}
        }
        const { sent } = await confirm({ id: prefill._id, anyway: step === "anyway" })
        return { unseen: !sent }
      } catch (cause) {
        return { error: messageOf(cause) }
      }
    },
    {}
  )
  if (!prefill.liveUrl)
    return (
      <Tile title="Filling the form">
        <p className="text-muted-foreground px-1 text-[13px]">
          Opening the posting and putting your answers in. This takes about a minute.
        </p>
      </Tile>
    )
  const run = (step: "check" | "anyway" | "close") => startTransition(() => act(step))
  return (
    <Tile title="Check it, then press Submit in the form" className="lg:h-[calc(100svh-5.5rem)]">
      {prefill.unfilled && prefill.unfilled.length > 0 && (
        <div className="px-1 text-[13px]">
          <span className="text-muted-foreground">Do these by hand in the form: </span>
          {prefill.unfilled.join(", ")}
        </div>
      )}
      <iframe
        src={prefill.liveUrl}
        title={`Application form for ${prefill.title} at ${prefill.company}`}
        className="h-[70svh] w-full rounded-lg border bg-white lg:h-auto lg:min-h-0 lg:flex-1"
      />
      <div className="flex flex-wrap items-center gap-2 px-1">
        <Button size="sm" disabled={pending} onClick={() => run("check")}>
          I sent it
        </Button>
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => run("close")}>
          Close without sending
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="ms-auto"
          render={<a href={prefill.liveUrl} target="_blank" rel="noopener noreferrer" />}
        >
          Open in a new tab
        </Button>
      </div>
      {state.unseen && (
        <div className="flex flex-wrap items-center gap-2 px-1 text-[13px]">
          <span>We can't see a thank-you page. If it went through, say so.</span>
          <Button size="xs" variant="outline" disabled={pending} onClick={() => run("anyway")}>
            Mark as sent
          </Button>
        </div>
      )}
      {state.error && (
        <p role="alert" className="text-destructive px-1 text-[13px]">
          {state.error}
        </p>
      )}
    </Tile>
  )
}

// Back and forth through what's waiting. An application you've finished isn't in the list,
// so it has no neighbours.
const Neighbors = ({ id }: { id: Id<"prefills"> }) => {
  const open = openOf(useQuery(api.prefilled.list))
  const at = open.findIndex((r) => r._id === id)
  if (at < 0 || open.length < 2) return null
  const step = (
    to: (typeof open)[number] | undefined,
    label: string,
    icon: typeof ArrowLeft01Icon
  ) =>
    to ? (
      <Button
        size="icon-sm"
        variant="ghost"
        aria-label={`${label}: ${to.title} at ${to.company}`}
        render={<Link to="/prefilled/$id" params={{ id: to._id }} />}
      >
        <HugeiconsIcon icon={icon} />
      </Button>
    ) : (
      <Button size="icon-sm" variant="ghost" aria-label={label} disabled>
        <HugeiconsIcon icon={icon} />
      </Button>
    )
  return (
    <nav aria-label="Applications" className="flex items-center gap-1">
      {step(open[at - 1], "Previous application", ArrowLeft01Icon)}
      <span className="text-muted-foreground text-xs tabular-nums">
        {at + 1} of {open.length}
      </span>
      {step(open[at + 1], "Next application", ArrowRight01Icon)}
    </nav>
  )
}

// One application: your answers on the left, the real form or what it's for on the right.
export const PrefilledPage = ({ id }: { id: Id<"prefills"> }) => {
  const data = useQuery(api.prefilled.get, { id })
  const startLive = useAction(api.prefilled.startLive)
  const dismiss = useMutation(api.prefilled.dismiss)
  const again = useMutation(api.prefilled.prepareAgain)
  const [error, act, pending] = useActionState(
    async (_: string | undefined, step: "apply" | "dismiss" | "again") => {
      try {
        if (step === "apply") await startLive({ id })
        else if (step === "dismiss") await dismiss({ id })
        else await again({ id })
        return undefined
      } catch (cause) {
        return messageOf(cause)
      }
    },
    undefined
  )
  const run = (step: "apply" | "dismiss" | "again") => startTransition(() => act(step))
  const prefill = data?.prefill
  const canApply = prefill?.status === "ready" || prefill?.status === "needsAnswers"
  const open = prefill?.status === "live"
  // A form can list a question twice (a pick list and its hidden twin). One answer covers both.
  const questions = prefill?.fields.filter(
    (f, i, all) => all.findIndex((o) => o.question === f.question) === i
  )
  return (
    <div className="soft-theme bg-background text-foreground flex h-svh flex-col rounded-[inherit] md:h-[calc(100svh-1rem)]">
      <PageHeader
        crumbs={[
          { label: "Prefilled applications", to: "/prefilled" },
          { label: prefill ? prefill.company : "" },
        ]}
        actions={<Neighbors id={id} />}
      />
      <ScrollArea className="min-h-0 flex-1">
        <main className="flex w-full flex-col gap-6 px-6 py-6">
          {data === null && (
            <p className="text-muted-foreground text-[13px]">That application isn't here.</p>
          )}
          {prefill && (
            <>
              <PageIntro title={prefill.title} description={summaryOf(prefill)}>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={statusVariant[prefill.status]} className="font-normal">
                    {statusLabels[prefill.status]}
                  </Badge>
                  {(canApply || prefill.status === "failed" || prefill.status === "dismissed") && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={pending}
                      onClick={() => run("again")}
                    >
                      Read the form again
                    </Button>
                  )}
                  {canApply && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      onClick={() => run("dismiss")}
                    >
                      Dismiss
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    render={<a href={prefill.url} target="_blank" rel="noopener noreferrer" />}
                  >
                    Open the posting
                  </Button>
                  {prefill.applicationId && (
                    <Button
                      size="sm"
                      variant="ghost"
                      render={<Link to="/" search={{ app: prefill.applicationId }} />}
                    >
                      Open the application
                    </Button>
                  )}
                </div>
              </PageIntro>
              {error && (
                <p role="alert" className="text-destructive text-[13px]">
                  {error}
                </p>
              )}
              {prefill.error && prefill.status !== "failed" && (
                <p role="alert" className="text-destructive text-[13px]">
                  {prefill.error}
                </p>
              )}
              {prefill.confirmation && (
                <p className="text-muted-foreground text-[13px]">{prefill.confirmation}</p>
              )}
              {prefill.aiUnavailable && canApply && (
                <div className="bg-muted/50 flex flex-wrap items-center gap-3 rounded-xl border p-3 text-[13px]">
                  <p className="min-w-56 flex-1">
                    AI isn't available right now, so nothing was picked or drafted. Your saved
                    answers are ready: open the browser and they'll already be in the form, then
                    type the rest there.
                  </p>
                  <Button size="sm" disabled={pending} onClick={() => run("apply")}>
                    {pending ? "Opening…" : "Open browser with my answers"}
                  </Button>
                </div>
              )}
              <div
                className={cn(
                  "grid items-start gap-3",
                  open
                    ? "lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]"
                    : "lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]"
                )}
              >
                <Tile title={`Your answers · ${questions?.length ?? 0}`}>
                  <div className="flex flex-col gap-3 px-1">
                    {prefill.fields.length === 0 && (
                      <p className="text-muted-foreground text-[13px]">
                        {prefill.status === "preparing"
                          ? "Reading the form…"
                          : "No questions read yet."}
                      </p>
                    )}
                    {!data.canDraft && canApply && leftToAnswer(prefill.fields) > 0 && (
                      <p className="text-muted-foreground text-xs">
                        Review your resume on the{" "}
                        <Link to="/resume" className="underline underline-offset-2">
                          Resume page
                        </Link>{" "}
                        and read the form again, and AI can draft these for you to check.
                      </p>
                    )}
                    {open && prefill.liveUrl && (
                      <p className="text-muted-foreground text-xs">
                        Each answer shows whether the app got it into the form, not edits you make
                        there. Send to form puts one in and shows you where it went, for about 1
                        Firecrawl credit.
                      </p>
                    )}
                    {questions?.map((field) => (
                      <AnswerRow
                        // Keeps its place while sending, so a problem can show beside it.
                        key={open ? field.question : `${field.question}:${field.answer ?? ""}`}
                        id={id}
                        field={field}
                        locked={!canApply && !open}
                        live={Boolean(open && prefill.liveUrl)}
                      />
                    ))}
                  </div>
                </Tile>
                <div
                  className={cn(
                    "flex flex-col gap-3 lg:sticky lg:top-4",
                    open && "order-first lg:order-none"
                  )}
                >
                  {open && <LiveBrowser prefill={prefill} />}
                  {canApply && (
                    <Tile title="The real form">
                      <div className="flex flex-col items-start gap-3 px-1">
                        <p className="text-muted-foreground text-[13px]">
                          Opens here with your answers already in. You check it and press its
                          Submit. About 3 Firecrawl credits.
                        </p>
                        <Button size="sm" disabled={pending} onClick={() => run("apply")}>
                          {pending ? "Opening…" : "Open browser"}
                        </Button>
                      </div>
                    </Tile>
                  )}
                  {!open && (
                    <Tile title="The role">
                      <div className="flex flex-col gap-3 px-1">
                        <p className="text-muted-foreground text-[13px]">
                          {[prefill.company, data.lead?.location].filter(Boolean).join(" · ")}
                        </p>
                        {data.lead && (
                          <>
                            <Badge
                              variant={data.lead.verdict === "notFit" ? "outline" : "success"}
                              className="w-fit font-normal"
                            >
                              {data.lead.fit}% ·{" "}
                              {data.lead.verdict === "notFit" ? "Not a fit" : "A fit for you"}
                            </Badge>
                            <p className="text-[13px] leading-relaxed">
                              {data.lead.reasons.join(" ")}
                            </p>
                            {data.lead.checks?.length ? (
                              <Breakdown checks={data.lead.checks} />
                            ) : null}
                          </>
                        )}
                        {data.preview && (
                          <p className="text-muted-foreground text-[13px] leading-relaxed">
                            {data.preview}…
                          </p>
                        )}
                      </div>
                    </Tile>
                  )}
                </div>
              </div>
            </>
          )}
        </main>
      </ScrollArea>
    </div>
  )
}
