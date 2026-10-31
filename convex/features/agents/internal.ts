import { ConvexError, v } from "convex/values"
import { components } from "../../_generated/api"
import type { Doc, Id } from "../../_generated/dataModel"
import { env, internalMutation, internalQuery, type MutationCtx } from "../../_generated/server"
import { checked } from "../../lib/ark"
import { logEdit } from "../activity/utils"
import { preparePosting, withAnswer } from "../prefilled/utils"
import { statusFrom } from "../prefilled/match"
import { maxListed, SetAnswer } from "../prefilled/validators"
import { saveWorkflow } from "../automations/utils"
import { limits as workflowLimits } from "../automations/validators"
import { openedContacts } from "../contacts/public"
import { createGoal, dayOf, updateGoal } from "../goals/utils"
import { maxGoals, NewGoal, UpdateGoal } from "../goals/validators"
import { searchJobs } from "../jobs/utils"
import { blankTemplate, defaultShow, maxLoops } from "../loops/catalog"
import {
  createLoop,
  lastRunOf,
  respondToLead,
  rowOf as loopRowOf,
  runLoopNow,
  shortlistOf,
} from "../loops/utils"
import { NewLoop } from "../loops/validators"
import { formNow, rowOf, writeAnswers } from "../preferences/utils"
import { Preferences } from "../preferences/validators"
import { createView } from "../views/public"
import { maxViews, ViewFields } from "../views/validators"
import { limits } from "../workflows/manager"
import { mine, revokeAgents } from "./utils"
import {
  vContactOut,
  vGoalArgs,
  vGoalOut,
  vJobOut,
  vJobRowOut,
  vLoopArgs,
  vLoopOut,
  vPreferencesAdd,
  vPreferencesOut,
  vPreferencesPatch,
  vPrefillOut,
  vPrefillRowOut,
  vShortlistOut,
  vViewArgs,
  vViewOut,
  vWorkflowArgs,
  vWorkflowFull,
  vWorkflowOut,
} from "./validators"

const vUserId = v.id("users")

const preferencesOf = async (ctx: MutationCtx, userId: Id<"users">) => ({
  ...(await formNow(ctx, userId)),
  hasResume: Boolean((await rowOf(ctx, userId))?.resumeId),
})

const preferences = internalQuery({
  args: { userId: vUserId },
  returns: vPreferencesOut,
  handler: async (ctx, { userId }) => ({
    ...(await formNow(ctx, userId)),
    hasResume: Boolean((await rowOf(ctx, userId))?.resumeId),
  }),
})

const updatePreferences = internalMutation({
  args: { userId: vUserId, ...vPreferencesPatch },
  returns: vPreferencesOut,
  handler: async (ctx, { userId, answers, ...patch }) => {
    const form = await formNow(ctx, userId)
    await writeAnswers(
      ctx,
      userId,
      checked(Preferences, { ...form, ...patch, answers: { ...form.answers, ...answers } }),
      { byAgent: true }
    )
    await logEdit(ctx, userId, "preferences.save", "A connected agent updated your preferences")
    return preferencesOf(ctx, userId)
  },
})

const addPreferences = internalMutation({
  args: { userId: vUserId, ...vPreferencesAdd },
  returns: vPreferencesOut,
  handler: async (ctx, { userId, custom, ...tags }) => {
    const form = await formNow(ctx, userId)
    const added = Object.fromEntries(
      (Object.keys(tags) as (keyof typeof tags)[]).map((key) => [
        key,
        [...new Set([...form[key], ...(tags[key] ?? [])])],
      ])
    )
    await writeAnswers(
      ctx,
      userId,
      checked(Preferences, { ...form, ...added, custom: [...form.custom, ...(custom ?? [])] }),
      { byAgent: true }
    )
    await logEdit(ctx, userId, "preferences.save", "A connected agent added to your preferences")
    return preferencesOf(ctx, userId)
  },
})

const searchJobsFor = internalQuery({
  args: {
    userId: vUserId,
    query: v.optional(v.string()),
    remoteOnly: v.optional(v.boolean()),
    since: v.optional(v.number()),
    fitsOnly: v.optional(v.boolean()),
    limit: v.number(),
  },
  returns: v.array(vJobRowOut),
  handler: async (ctx, { userId, query, remoteOnly, since, fitsOnly, limit }) => {
    const { page } = await searchJobs(ctx, userId, {
      q: query,
      remoteOnly,
      since,
      fits: fitsOnly,
      paginationOpts: { numItems: limit, cursor: null },
    })
    return page.map(({ _id, ...job }) => ({ id: _id, ...job }))
  },
})

const jobOut = (lead: Doc<"jobLeads"> | null, job: Doc<"jobs"> | null) => ({
  id: lead?._id ?? job!._id,
  title: job?.title ?? lead!.title,
  company: job?.company ?? lead!.company,
  location: job?.location ?? lead?.location ?? "",
  url: job?.url ?? lead!.url,
  text: job?.text ?? lead?.text ?? lead?.snippet ?? "",
  fit: lead?.fit ?? null,
  verdict: lead?.verdict ?? null,
  reasons: lead?.reasons ?? [],
  checks: (lead?.checks ?? []).map(({ label, kind, result }) => ({ label, kind, result })),
})

const job = internalQuery({
  args: { userId: vUserId, id: v.string() },
  returns: vJobOut,
  handler: async (ctx, { userId, id }) => {
    const jobId = ctx.db.normalizeId("jobs", id)
    const found = jobId && (await ctx.db.get("jobs", jobId))
    if (found) {
      const lead = await ctx.db
        .query("jobLeads")
        .withIndex("by_userId_and_urlKey", (q) => q.eq("userId", userId).eq("urlKey", found.urlKey))
        .first()
      return jobOut(lead, found)
    }
    const lead = await mine(ctx, "jobLeads", userId, id, `No role with id ${id}. Use search_jobs.`)
    return jobOut(lead, lead.jobId ? await ctx.db.get("jobs", lead.jobId) : null)
  },
})

const shortlist = internalQuery({
  args: { userId: vUserId, status: v.union(v.literal("new"), v.literal("saved")) },
  returns: v.array(vShortlistOut),
  handler: async (ctx, { userId, status }) =>
    (await shortlistOf(ctx, userId, status)).slice(0, 50).map((lead) => ({
      id: lead._id,
      title: lead.title,
      company: lead.company,
      location: lead.location ?? "",
      url: lead.url,
      fit: lead.fit,
      reasons: lead.reasons,
      status: lead.status,
    })),
})

const respond = internalMutation({
  args: {
    userId: vUserId,
    id: v.string(),
    action: v.union(v.literal("save"), v.literal("favorite"), v.literal("dismiss")),
  },
  returns: v.object({ id: v.string(), status: v.string() }),
  handler: async (ctx, { userId, id, action }) => {
    const lead = await mine(
      ctx,
      "jobLeads",
      userId,
      id,
      `No shortlisted role with id ${id}. Use list_shortlist.`
    )
    await respondToLead(ctx, lead, action)
    const did = { dismiss: "dismissed", favorite: "favorited", save: "saved" }[action]
    await logEdit(
      ctx,
      userId,
      "loop.role",
      `A connected agent ${did} ${lead.title} · ${lead.company}`
    )
    return { id, status: (await ctx.db.get("jobLeads", lead._id))!.status }
  },
})

const loopOut = async (ctx: MutationCtx, loop: Doc<"loops">) => {
  const last = await lastRunOf(ctx, loop._id)
  return {
    id: loop._id,
    name: loop.name,
    active: loop.active,
    prompt: loop.prompt ?? "",
    answers: loop.answers,
    daily: loop.daily,
    show: loop.show,
    at: loop.at,
    timeZone: loop.timeZone,
    lastRun: last && {
      status: last.status,
      startedAt: last.startedAt,
      scanned: last.scanned,
      kept: last.kept,
      note: last.note ?? null,
    },
  }
}

const loops = internalQuery({
  args: { userId: vUserId },
  returns: v.array(vLoopOut),
  handler: async (ctx, { userId }) => {
    const rows = await ctx.db
      .query("loops")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .take(maxLoops)
    return Promise.all(rows.map((loop) => loopOut(ctx as MutationCtx, loop)))
  },
})

const saveLoop = internalMutation({
  args: { userId: vUserId, ...vLoopArgs },
  returns: vLoopOut,
  handler: async (ctx, { userId, id, answers, active, ...fields }) => {
    const known =
      id !== undefined
        ? await mine(ctx, "loops", userId, id, `No loop with id ${id}. Use list_job_searches.`)
        : null
    const loop = checked(NewLoop, {
      template: known?.template ?? blankTemplate.id,
      prompt: known?.prompt ?? "",
      daily: known?.daily ?? blankTemplate.daily,
      show: known?.show ?? defaultShow,
      at: known?.at ?? blankTemplate.at,
      ...(known && { name: known.name, timeZone: known.timeZone }),
      ...fields,
      answers: { ...(known?.answers ?? blankTemplate.answers), ...answers },
      auto: active ?? known?.active ?? false,
    })
    if (!known) {
      const created = await createLoop(ctx, userId, loop)
      await logEdit(ctx, userId, "loop.create", `A connected agent added the loop ${loop.name}`)
      return loopOut(ctx, (await ctx.db.get("loops", created))!)
    }
    await ctx.db.patch("loops", known._id, loopRowOf(loop))
    await logEdit(ctx, userId, "loop.update", `A connected agent changed the loop ${loop.name}`)
    return loopOut(ctx, (await ctx.db.get("loops", known._id))!)
  },
})

const runLoop = internalMutation({
  args: { userId: vUserId, id: v.string() },
  returns: v.object({ runId: v.string(), status: v.string() }),
  handler: async (ctx, { userId, id }) => {
    const loop = await mine(
      ctx,
      "loops",
      userId,
      id,
      `No loop with id ${id}. Use list_job_searches.`
    )
    const runId = await runLoopNow(ctx, loop)
    await logEdit(ctx, userId, "loop.runNow", `A connected agent started the loop ${loop.name}`)
    return { runId, status: "queued" }
  },
})

const prepare = internalMutation({
  args: { userId: vUserId, id: v.string() },
  returns: v.object({ id: v.string(), status: v.string() }),
  handler: async (ctx, { userId, id }) => {
    const jobId = ctx.db.normalizeId("jobs", id) ?? undefined
    const leadId = ctx.db.normalizeId("jobLeads", id) ?? undefined
    // A lead of someone else's gets the same answer as an id that was never a role.
    const lead = leadId && (await ctx.db.get("jobLeads", leadId))
    if ((!jobId && !lead) || (lead && lead.userId !== userId))
      throw new ConvexError(`No role with id ${id}. Use search_jobs or list_shortlist.`)
    const prefillId = await preparePosting(ctx, userId, { jobId, leadId })
    return { id: prefillId, status: (await ctx.db.get("prefills", prefillId))!.status }
  },
})

const appUrlOf = (path: string, id: string) => `${env.SITE_URL}/${path}/${id}`

const needsAnswer = (f: Doc<"prefills">["fields"][number]) =>
  f.required && (!f.answer || f.source === "ai")

const prefills = internalQuery({
  args: {
    userId: vUserId,
    status: v.optional(v.string()),
    limit: v.number(),
  },
  returns: v.array(vPrefillRowOut),
  handler: async (ctx, { userId, status, limit }) =>
    (
      await ctx.db
        .query("prefills")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .order("desc")
        .take(maxListed)
    )
      .filter((row) => (status ? row.status === status : row.status !== "dismissed"))
      .slice(0, limit)
      .map((row) => ({
        id: row._id,
        company: row.company,
        title: row.title,
        status: row.status,
        unanswered: row.fields.filter(needsAnswer).length,
        appUrl: appUrlOf("prefilled", row._id),
      })),
})

const prefillOut = (row: Doc<"prefills">) => ({
  id: row._id,
  company: row.company,
  title: row.title,
  status: row.status,
  error: row.error ?? null,
  appUrl: appUrlOf("prefilled", row._id),
  // Never the row's liveUrl: that's a browser on the filled form, where Submit is one click.
  fields: row.fields.map((f) => ({
    question: f.question,
    type: f.type,
    required: f.required,
    options: f.options ?? null,
    answer: f.answer ?? null,
    source: f.source,
  })),
})

const prefill = internalQuery({
  args: { userId: vUserId, id: v.string() },
  returns: vPrefillOut,
  handler: async (ctx, { userId, id }) =>
    prefillOut(
      await mine(
        ctx,
        "prefills",
        userId,
        id,
        `No prepared application with id ${id}. Use list_prepared_applications.`
      )
    ),
})

const setAnswer = internalMutation({
  args: { userId: vUserId, id: v.string(), question: v.string(), answer: v.string() },
  returns: vPrefillOut,
  handler: async (ctx, { userId, id, question, answer }) => {
    const row = await mine(
      ctx,
      "prefills",
      userId,
      id,
      `No prepared application with id ${id}. Use list_prepared_applications.`
    )
    if (row.status !== "ready" && row.status !== "needsAnswers")
      throw new ConvexError(`Answers can't be changed while this is ${row.status}.`)
    const text = checked(SetAnswer, { id, question, answer }).answer
    if (!text) throw new ConvexError("Write an answer. Only the user can clear one.")
    // A draft, not the user's word: the app keeps asking them to check it before it's ready.
    const fields = withAnswer(row, question, text, "ai")
    await ctx.db.patch("prefills", row._id, { fields, status: statusFrom(fields) })
    await logEdit(
      ctx,
      userId,
      "prefill.answer",
      `A connected agent drafted an answer on ${row.title} · ${row.company}`,
      { prefillId: row._id }
    )
    return prefillOut((await ctx.db.get("prefills", row._id))!)
  },
})

const goalOut = (goal: Doc<"goals">) => ({
  id: goal._id,
  name: goal.name,
  summary: goal.summary,
  priority: goal.priority,
  start: goal.start,
  target: goal.target,
  milestones: goal.milestones,
  loopId: goal.loopId ?? null,
})

const goals = internalQuery({
  args: { userId: vUserId },
  returns: v.array(vGoalOut),
  handler: async (ctx, { userId }) =>
    (
      await ctx.db
        .query("goals")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .take(maxGoals)
    ).map(goalOut),
})

const saveGoal = internalMutation({
  args: { userId: vUserId, ...vGoalArgs },
  returns: vGoalOut,
  handler: async (ctx, { userId, id, loopId, ...fields }) => {
    const loop =
      typeof loopId === "string"
        ? (await mine(ctx, "loops", userId, loopId, `No loop with id ${loopId}.`))._id
        : loopId
    const link = loop === undefined ? {} : { loopId: loop }
    if (id !== undefined) {
      const known = await mine(ctx, "goals", userId, id, `No goal with id ${id}. Use list_goals.`)
      await updateGoal(ctx, userId, checked(UpdateGoal, { id: known._id, ...fields, ...link }))
      await logEdit(ctx, userId, "goal.update", `A connected agent changed the goal ${known.name}`)
      return goalOut((await ctx.db.get("goals", known._id))!)
    }
    const goal = checked(NewGoal, {
      summary: "",
      priority: "none",
      start: dayOf(Date.now()),
      milestones: [],
      ...fields,
      ...link,
    })
    const created = await createGoal(ctx, userId, goal)
    await logEdit(ctx, userId, "goal.create", `A connected agent added the goal ${goal.name}`)
    return goalOut((await ctx.db.get("goals", created))!)
  },
})

const viewOut = (view: Doc<"views">) => ({
  id: view._id,
  name: view.name,
  description: view.description,
  filters: view.filters,
  display: view.display ?? null,
})

const views = internalQuery({
  args: { userId: vUserId },
  returns: v.array(vViewOut),
  handler: async (ctx, { userId }) =>
    (
      await ctx.db
        .query("views")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .take(maxViews)
    ).map(viewOut),
})

const saveView = internalMutation({
  args: { userId: vUserId, ...vViewArgs },
  returns: vViewOut,
  handler: async (ctx, { userId, id, ...fields }) => {
    if (id !== undefined) {
      const known = await mine(ctx, "views", userId, id, `No view with id ${id}. Use list_views.`)
      const { _id, _creationTime, userId: _owner, ...current } = known
      await ctx.db.patch("views", known._id, checked(ViewFields, { ...current, ...fields }))
      await logEdit(ctx, userId, "view.update", "A connected agent changed a board view")
      return viewOut((await ctx.db.get("views", known._id))!)
    }
    const created = await createView(
      ctx,
      userId,
      checked(ViewFields, { description: "", filters: {}, ...fields })
    )
    await logEdit(ctx, userId, "view.create", "A connected agent saved a board view")
    return viewOut((await ctx.db.get("views", created))!)
  },
})

const contacts = internalQuery({
  args: { userId: vUserId, query: v.optional(v.string()), limit: v.number() },
  returns: v.array(vContactOut),
  handler: async (ctx, { userId, query, limit }) => {
    // ponytail: details are sealed, so a search opens the newest 200. An index on sealed text
    // can't exist, so older contacts need the Contacts page.
    const rows = await ctx.db
      .query("contacts")
      .withIndex("by_userId_and_lastAt", (q) => q.eq("userId", userId))
      .order("desc")
      .take(200)
    const words = query?.trim().toLowerCase()
    return (await openedContacts(userId, rows))
      .filter(
        (c) =>
          !words || `${c.name} ${c.company} ${c.email} ${c.title}`.toLowerCase().includes(words)
      )
      .slice(0, limit)
      .map(({ applicationId: _applicationId, notes, ...contact }) => ({
        ...contact,
        notes: notes.length > 500 ? `${notes.slice(0, 500)}…` : notes,
      }))
  },
})

const workflowOut = (row: Doc<"automations">) => ({
  id: row._id,
  name: row.name,
  active: row.active,
  trigger: row.trigger,
  stepCount: row.steps.length,
  appUrl: appUrlOf("workflows", row._id),
})

const workflows = internalQuery({
  args: { userId: vUserId },
  returns: v.array(vWorkflowOut),
  handler: async (ctx, { userId }) =>
    (
      await ctx.db
        .query("automations")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .take(workflowLimits.automations)
    ).map(workflowOut),
})

const workflow = internalQuery({
  args: { userId: vUserId, id: v.string() },
  returns: vWorkflowFull,
  handler: async (ctx, { userId, id }) => {
    const row = await mine(
      ctx,
      "automations",
      userId,
      id,
      `No workflow with id ${id}. Use list_workflows.`
    )
    return { ...workflowOut(row), steps: row.steps }
  },
})

const saveWorkflowFor = internalMutation({
  args: { userId: vUserId, ...vWorkflowArgs },
  returns: vWorkflowOut,
  handler: async (ctx, { userId, id, ...fields }) => {
    const known =
      id !== undefined
        ? await mine(
            ctx,
            "automations",
            userId,
            id,
            `No workflow with id ${id}. Use list_workflows.`
          )
        : null
    // Always off, even one that was on: a workflow can send email on its own, so only the
    // person turns it on, after reading it in the app.
    const saved = await saveWorkflow(ctx, userId, {
      ...fields,
      ...(known && { id: known._id }),
      active: false,
    })
    await ctx.db.patch("automations", saved, { byAgent: true })
    await logEdit(
      ctx,
      userId,
      "workflow.save",
      `A connected agent ${known ? "changed and turned off" : "drafted"} the workflow ${fields.name.trim()}`,
      { automationId: saved }
    )
    return workflowOut((await ctx.db.get("automations", saved))!)
  },
})

const notifyUser = internalMutation({
  args: { userId: vUserId, message: v.string() },
  returns: v.object({ sent: v.boolean() }),
  handler: async (ctx, { userId, message }) => {
    const text = message.trim()
    if (!text || text.length > 500) throw new ConvexError("A message is 1 to 500 characters.")
    const { ok } = await limits.limit(ctx, "agentNotify", { key: userId })
    if (!ok) throw new ConvexError("That's 20 messages today. Try again tomorrow.")
    const id = await ctx.runMutation(components.notifications.lib.notify, {
      owner: userId,
      kind: "agent.message",
      message: text,
    })
    return { sent: id !== null }
  },
})

// See removeAgents: this one catches a code approved just before the account went.
const revokeAgain = internalMutation({
  args: { userId: vUserId },
  returns: v.null(),
  handler: async (ctx, { userId }) => {
    await revokeAgents(ctx, userId)
    return null
  },
})

export const internalApi = {
  preferences,
  updatePreferences,
  addPreferences,
  searchJobsFor,
  job,
  shortlist,
  respond,
  loops,
  saveLoop,
  runLoop,
  prepare,
  prefills,
  prefill,
  setAnswer,
  goals,
  saveGoal,
  views,
  saveView,
  contacts,
  workflows,
  workflow,
  saveWorkflowFor,
  revokeAgain,
  notifyUser,
}
