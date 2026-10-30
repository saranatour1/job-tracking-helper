import type { MutationCtx, QueryCtx, ActionCtx } from "../../_generated/server"
import type { Id, Doc } from "../../_generated/dataModel"
import { ConvexError, type Infer } from "convex/values"
import { NewLoop } from "./validators"
import { isTimeZone, nextRunAt } from "./schedule"
import { workflow, readPool } from "../workflows/manager"
import { internal } from "../../_generated/api"
import { type Provider, type LoopAnswers, defaultShow } from "./catalog"
import { rowLimits } from "../preferences/rows"
import { criteriaOf } from "../workflows/fit"
import { profileOf } from "../workflows/judge"
import { monthOf, apiKeyOf } from "../workflows/sources"
import type { WorkflowId } from "@convex-dev/workflow"
import type { WorkId } from "@convex-dev/workpool"
import { workLog } from "../../lib/log"
import { record, post, text } from "../workflows/sources/source"
import { maxText, companyOf, boardOf, previewOf } from "../jobs/boards"
import type { vPasted } from "../workflows/validators"
import { judge } from "../workflows/utils"

export const ownLoop = async (ctx: MutationCtx, userId: Id<"users">, loopId: Id<"loops">) => {
  const loop = await ctx.db.get("loops", loopId)
  if (!loop || loop.userId !== userId) throw new ConvexError("That loop doesn't exist.")
  return loop
}

// A loop as it's kept, from the setup form's answers. Its next run moves to the new time.
export const rowOf = (loop: typeof NewLoop.infer) => {
  if (loop.answers.remoteOnly && loop.answers.nearMe)
    throw new ConvexError("Pick remote only or on-site near you, not both.")
  if (!isTimeZone(loop.timeZone)) throw new ConvexError("That time zone isn't one we know.")
  const { auto, prompt, ...fields } = loop
  return {
    ...fields,
    prompt: prompt || undefined,
    active: auto,
    nextRunAt: nextRunAt(Date.now(), loop.at, loop.timeZone),
  }
}

export const lastRunOf = (ctx: MutationCtx, loopId: Id<"loops">) =>
  ctx.db
    .query("loopRuns")
    .withIndex("by_loopId_and_startedAt", (q) => q.eq("loopId", loopId))
    .order("desc")
    .first()

export const ownLead = async (ctx: MutationCtx, userId: Id<"users">, leadId: Id<"jobLeads">) => {
  const lead = await ctx.db.get("jobLeads", leadId)
  if (!lead || lead.userId !== userId) throw new ConvexError("That job doesn't exist.")
  return lead
}

// Keeps the run's counts in step as people act, so the Runs tab shows what came of
// each morning.
export const countOnRun = async (
  ctx: MutationCtx,
  runId: Id<"loopRuns"> | undefined,
  field: "saved" | "applied"
) => {
  const run = runId && (await ctx.db.get("loopRuns", runId))
  if (run) await ctx.db.patch("loopRuns", run._id, { [field]: run[field] + 1 })
}

// A queued run of a loop, for the Runs tab. A workflow's Find roles step runs it as part
// of its own run; otherwise `startRun` starts it.
export const insertLoopRun = (ctx: MutationCtx, loop: Doc<"loops">) =>
  ctx.db.insert("loopRuns", {
    loopId: loop._id,
    userId: loop.userId,
    loopName: loop.name,
    status: "queued",
    scanned: 0,
    kept: 0,
    saved: 0,
    applied: 0,
    credits: 0,
    startedAt: Date.now(),
  })

// Starts one run of a loop: a queued row, then the workflow.
export const startRun = async (ctx: MutationCtx, loop: Doc<"loops">) => {
  const runId = await insertLoopRun(ctx, loop)
  const workflowId = await workflow.start(
    ctx,
    internal.workflows.findJobs,
    { runId },
    { onComplete: internal.loops.runEnded, context: { runId } }
  )
  await ctx.db.patch("loopRuns", runId, { workflowId })
  return runId
}

export const usageOf = (ctx: MutationCtx, provider: Provider, month: string) =>
  ctx.db
    .query("sourceUsage")
    .withIndex("by_provider_and_month", (q) => q.eq("provider", provider).eq("month", month))
    .unique()

// What Jev judges roles against for this person: the loop's answers and words, their
// Preferences, and the last roles they rated. Pasted links use it with the defaults.
export const profileFor = async (
  ctx: QueryCtx,
  userId: Id<"users">,
  answers: LoopAnswers,
  prompt?: string
) => {
  const tags = await ctx.db
    .query("preferenceTags")
    .withIndex("by_userId_and_kind_and_order", (q) => q.eq("userId", userId))
    .take(rowLimits.tags)
  const settings = await ctx.db
    .query("preferences")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .unique()
  const written = await ctx.db
    .query("profileEntries")
    .withIndex("by_userId_and_kind_and_order", (q) => q.eq("userId", userId).eq("kind", "answer"))
    .take(rowLimits.answer)
  const answer = (key: string) => written.find((e) => e.key === key)?.value.trim()
  const rated = async (feedback: "more" | "less") =>
    (
      await ctx.db
        .query("jobLeads")
        .withIndex("by_userId_and_feedback", (q) => q.eq("userId", userId).eq("feedback", feedback))
        .order("desc")
        .take(8)
    ).map((l) => `${l.title} at ${l.company}`)
  const criteria = criteriaOf(answers, tags)
  return {
    criteria,
    profile: profileOf(criteria, {
      prompt,
      workMode: settings?.workMode ?? "any",
      pay: answer("pay"),
      visa: answer("visa"),
      liked: await rated("more"),
      disliked: await rated("less"),
    }),
  }
}

export const addUsage = async (
  ctx: MutationCtx,
  provider: Provider,
  credits: number,
  exhausted: boolean
) => {
  const month = monthOf(Date.now())
  const usage = await usageOf(ctx, provider, month)
  const exhaustedAt = exhausted ? Date.now() : usage?.exhaustedAt
  if (usage)
    await ctx.db.patch("sourceUsage", usage._id, { used: usage.used + credits, exhaustedAt })
  else
    await ctx.db.insert("sourceUsage", {
      provider,
      month,
      used: credits,
      ...(exhaustedAt && { exhaustedAt }),
    })
}

// Puts a loop's best waiting fits on the shortlist, as many as the person has room for:
// the loop's size, less the roles from it still on their shortlist. Returns how many.
// ponytail: a waiting role can close on its board before it's shown; the sheet still
// opens it, and the link says so.
export const fillShortlist = async (ctx: MutationCtx, userId: Id<"users">, loopId: Id<"loops">) => {
  const loop = await ctx.db.get("loops", loopId)
  const of = async (status: "new" | "waiting") =>
    (
      await ctx.db
        .query("jobLeads")
        .withIndex("by_userId_and_status", (q) => q.eq("userId", userId).eq("status", status))
        .take(300)
    ).filter((l) => l.loopId === loopId)
  const room = Math.max(0, (loop?.show ?? defaultShow) - (await of("new")).length)
  const best = (await of("waiting")).sort((a, b) => b.fit - a.fit).slice(0, room)
  for (const lead of best) await ctx.db.patch("jobLeads", lead._id, { status: "new" })
  return best.length
}

// Stops a run in progress: cancels its workflow and the judgments not started yet.
// ponytail: the search's credits live in the canceled workflow, so a stopped run
// under-counts by those few.
export const stopRunNow = async (ctx: MutationCtx, run: Doc<"loopRuns">) => {
  if (run.workflowId) await workflow.cancel(ctx, run.workflowId as WorkflowId)
  for (const id of run.readWorkIds ?? []) await readPool.cancel(ctx, id as WorkId)
  await ctx.db.patch("loopRuns", run._id, {
    status: "stopped",
    finishedAt: Date.now(),
    note: `Stopped after Jev judged ${run.scanned} roles. Nothing was saved.`,
    readsLeft: undefined,
    readWorkIds: undefined,
    candidates: undefined,
    readFailures: undefined,
  })
  const log = workLog("loop.run", { runId: run._id, loopId: run.loopId, userId: run.userId })
  log.set({ outcome: "stopped", scanned: run.scanned, runMs: Date.now() - run.startedAt })
  log.emit()
}

// Everything Loops stored for a user, for deleting an account. Usage is shared, so it stays.
export const deleteLoops = async (ctx: MutationCtx, userId: Id<"users">) => {
  for await (const loop of ctx.db
    .query("loops")
    .withIndex("by_userId", (q) => q.eq("userId", userId)))
    await ctx.db.delete("loops", loop._id)
  for await (const run of ctx.db
    .query("loopRuns")
    .withIndex("by_userId_and_startedAt", (q) => q.eq("userId", userId)))
    await ctx.db.delete("loopRuns", run._id)
  for await (const lead of ctx.db
    .query("jobLeads")
    .withIndex("by_userId_and_status", (q) => q.eq("userId", userId)))
    await ctx.db.delete("jobLeads", lead._id)
}

// Reads a page that isn't on a job board, once, through Firecrawl (1 credit).
export const scrape = async (url: string) => {
  const apiKey = apiKeyOf("firecrawl")
  if (!apiKey)
    throw new ConvexError(
      "Only Greenhouse, Lever, Ashby and Personio links work until a Firecrawl key is set."
    )
  const data = record(
    record(
      await post(
        "https://api.firecrawl.dev/v2/scrape",
        apiKey,
        { url, formats: ["markdown"], onlyMainContent: true },
        (status) => status === 402
      )
    ).data
  )
  const page = text(data.markdown).slice(0, maxText)
  if (!page) throw new ConvexError("That page has no text we could read.")
  const host = new URL(url).hostname.replace(/^(www|jobs|careers)\./, "")
  return {
    title: text(record(data.metadata).title) || "Untitled role",
    company: companyOf(host.split(".")[0] ?? host),
    location: "",
    remote: /remote/i.test(page.slice(0, 1500)),
    text: page,
  }
}

export const isLink = (link: string) =>
  link.length <= 2000 && URL.canParse(link) && /^https?:$/.test(new URL(link).protocol)

// Reads a posting and has Jev judge it against the person's Preferences, like a loop
// would. Board links read the free feed; anything else costs one Firecrawl credit.
export const readAndJudge = async (
  ctx: ActionCtx,
  userId: Id<"users">,
  link: string,
  key: string
): Promise<{ lead: Infer<typeof vPasted>; credits: number }> => {
  // A board link reads the free feed. Some boards don't publish one, so a role the
  // feed doesn't list is read from its page instead, like any other link.
  const board = boardOf(link)
  let job: Doc<"jobs"> | null = null
  if (board) {
    job = await ctx.runQuery(internal.jobs.byUrlKey, { urlKey: key })
    if (!job) {
      const boardId = await ctx.runMutation(internal.jobs.ensureBoard, board)
      await ctx.runAction(internal.jobs.fetchBoard, { boardId }).catch(() => null)
      job = await ctx.runQuery(internal.jobs.byUrlKey, { urlKey: key })
    }
  }
  const page = job ?? (await scrape(link))
  const profile = await ctx.runQuery(internal.loops.profileForLink, { userId })
  const { cost: _cost, ...verdict } = await judge(profile, page)
  return {
    credits: job ? 0 : 1,
    lead: {
      url: job?.url ?? link,
      urlKey: key,
      title: page.title,
      company: page.company,
      location: page.location,
      snippet: previewOf(page.text, 300),
      ...(job ? { jobId: job._id } : { text: page.text }),
      ...verdict,
    },
  }
}
