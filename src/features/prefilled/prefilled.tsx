import { api } from "@convex/_generated/api"
import type { Doc, Id } from "@convex/_generated/dataModel"
import { Link } from "@tanstack/react-router"
import { useAction, useMutation } from "convex/react"
import { useQuery } from "convex-helpers/react/cache/hooks"
import { startTransition, useActionState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { messageOf } from "@/features/account/settings"
import { Breakdown } from "@/features/loops/shortlist"
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

const leftToAnswer = (fields: Field[]) => fields.filter((f) => f.required && !f.answer).length

const summaryOf = (row: Pick<Prefill, "status" | "fields" | "error">) => {
  if (row.status === "preparing") return "Reading the form and matching your saved answers."
  if (row.status === "failed") return row.error ?? "It couldn't be prepared."
  const left = leftToAnswer(row.fields)
  const answered = row.fields.filter((f) => f.answer).length
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
  const open = (rows ?? []).filter(
    (r) => r.status !== "applied" && r.status !== "dismissed" && r.status !== "failed"
  )
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
      : field.source === "you"
        ? "You"
        : field.required
          ? "Needs you"
          : "Optional"

// One question and its answer. Saving it here changes this application only, unless you
// tick Keep for future forms.
const AnswerRow = ({
  id,
  field,
  locked,
}: {
  id: Id<"prefills">
  field: Field
  locked: boolean
}) => {
  const setAnswer = useMutation(api.prefilled.setAnswer)
  const [error, save, pending] = useActionState(async (_: string | undefined, form: FormData) => {
    const answer = form.get("answer")
    try {
      await setAnswer({
        id,
        question: field.question,
        answer: typeof answer === "string" ? answer : "",
        keep: form.get("keep") === "on",
      })
      return undefined
    } catch (cause) {
      return messageOf(cause)
    }
  }, undefined)
  const items = field.options?.map((o) => ({ value: o, label: o }))
  const needed = field.required && !field.answer
  return (
    <form action={save} className="flex flex-col gap-1.5 border-t pt-3 first:border-t-0 first:pt-0">
      <div className="flex items-start gap-2">
        <label htmlFor={field.question} className="me-auto text-[13px] font-medium">
          {field.question}
        </label>
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
      {!locked && (
        <div className="flex items-center gap-3">
          {field.source !== "saved" && field.source !== "jev" && (
            <label className="text-muted-foreground flex items-center gap-1.5 text-xs">
              <input type="checkbox" name="keep" />
              Keep for future forms
            </label>
          )}
          <Button type="submit" size="xs" variant="outline" className="ms-auto" disabled={pending}>
            Save
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
    <Tile title="Check it, then press Submit in the form" className="md:col-span-2">
      {prefill.unfilled && prefill.unfilled.length > 0 && (
        <div className="px-1 text-[13px]">
          <span className="text-muted-foreground">Do these by hand in the form: </span>
          {prefill.unfilled.join(", ")}
        </div>
      )}
      <iframe
        src={prefill.liveUrl}
        title={`Application form for ${prefill.title} at ${prefill.company}`}
        className="h-[70svh] w-full rounded-lg border bg-white"
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

// One application: why it fits, your answers, and Apply now.
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
  return (
    <div className="soft-theme bg-background text-foreground flex h-svh flex-col rounded-[inherit] md:h-[calc(100svh-1rem)]">
      <PageHeader
        crumbs={[
          { label: "Prefilled applications", to: "/prefilled" },
          { label: prefill ? prefill.company : "" },
        ]}
      />
      <ScrollArea className="min-h-0 flex-1">
        <main className={pageBody}>
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
                  {canApply && (
                    <Button size="sm" disabled={pending} onClick={() => run("apply")}>
                      {pending ? "Opening…" : "Apply now"}
                    </Button>
                  )}
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
              <div className={tileGrid}>
                {prefill.status === "live" && <LiveBrowser prefill={prefill} />}
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
                        <p className="text-[13px] leading-relaxed">{data.lead.reasons.join(" ")}</p>
                        {data.lead.checks?.length ? <Breakdown checks={data.lead.checks} /> : null}
                      </>
                    )}
                    {data.preview && (
                      <p className="text-muted-foreground text-[13px] leading-relaxed">
                        {data.preview}…
                      </p>
                    )}
                  </div>
                </Tile>
                <Tile title={`Your answers · ${prefill.fields.length}`}>
                  <div className="flex flex-col gap-3 px-1">
                    {prefill.fields.length === 0 && (
                      <p className="text-muted-foreground text-[13px]">
                        {prefill.status === "preparing"
                          ? "Reading the form…"
                          : "No questions read yet."}
                      </p>
                    )}
                    {prefill.fields.map((field) => (
                      <AnswerRow
                        key={`${field.question}:${field.answer ?? ""}`}
                        id={id}
                        field={field}
                        locked={!canApply}
                      />
                    ))}
                  </div>
                </Tile>
              </div>
            </>
          )}
        </main>
      </ScrollArea>
    </div>
  )
}
