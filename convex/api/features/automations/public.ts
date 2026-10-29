import { ConvexError, v } from "convex/values"
import schema from "../../../schema"
import type { Doc, Id } from "../../../_generated/dataModel"
import type { MutationCtx } from "../../../_generated/server"
import { authedMutation, authedQuery } from "../../../lib/functions"
import { limits as rates } from "../workflows/manager"
import { choicesOf, countsOf, deleteRuns } from "./counts"
import { cancelRun, startRun } from "./engine"
import {
  blocksOf,
  limits,
  nextScheduledAt,
  problemOf,
  type Trigger,
  vStep,
  vTrigger,
} from "./validators"

const own = async (ctx: MutationCtx, userId: Id<"users">, id: Id<"automations">) => {
  const automation = await ctx.db.get("automations", id)
  if (automation?.userId !== userId) throw new ConvexError("That workflow isn't yours.")
  return automation
}

const nextRunOf = (trigger: Trigger, active: boolean) =>
  active && trigger.kind === "schedule" ? nextScheduledAt(Date.now(), trigger) : undefined

const list = authedQuery({
  args: {},
  returns: v.array(schema.doc("automations")),
  handler: (ctx) =>
    ctx.db
      .query("automations")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
      .take(limits.automations),
})

/** How many of a workflow's runs are going, done, failed or canceled. */
const counts = authedQuery({
  args: { automationId: v.id("automations") },
  returns: v.object({
    running: v.number(),
    done: v.number(),
    failed: v.number(),
    canceled: v.number(),
  }),
  handler: async (ctx, { automationId }) => {
    const automation = await ctx.db.get("automations", automationId)
    if (automation?.userId !== ctx.userId) return { running: 0, done: 0, failed: 0, canceled: 0 }
    return countsOf(ctx, automationId)
  },
})

/** How often Jev gave each answer at each Ask Jev step, by place then answer. */
const choices = authedQuery({
  args: { automationId: v.id("automations") },
  returns: v.record(v.string(), v.record(v.string(), v.number())),
  handler: async (ctx, { automationId }) => {
    const automation = await ctx.db.get("automations", automationId)
    if (automation?.userId !== ctx.userId) return {}
    return choicesOf(ctx, automationId, automation.steps)
  },
})

/** A workflow's latest runs, newest first. */
const runs = authedQuery({
  args: { automationId: v.id("automations") },
  returns: v.array(schema.doc("automationRuns")),
  handler: async (ctx, { automationId }) => {
    const automation = await ctx.db.get("automations", automationId)
    if (automation?.userId !== ctx.userId) return []
    return ctx.db
      .query("automationRuns")
      .withIndex("by_automationId_and_startedAt", (q) => q.eq("automationId", automationId))
      .order("desc")
      .take(20)
  },
})

/** Adds a workflow, or changes yours with this id. Runs already going keep their steps. */
const save = authedMutation({
  args: {
    id: v.optional(v.id("automations")),
    name: v.string(),
    trigger: vTrigger,
    steps: v.array(vStep),
    active: v.boolean(),
  },
  returns: v.id("automations"),
  handler: async (ctx, { id, ...automation }) => {
    const name = automation.name.trim()
    const problem = problemOf(name, automation.trigger, automation.steps)
    if (problem) throw new ConvexError(problem)
    for (const step of blocksOf(automation.steps))
      if ((step.kind === "addNote" || step.kind === "move") && step.applicationId) {
        const application = await ctx.db.get("applications", step.applicationId)
        if (application?.userId !== ctx.userId)
          throw new ConvexError("That application isn't yours, or it's gone.")
      } else if (step.kind === "findRoles") {
        const loop = await ctx.db.get("loops", step.loopId)
        if (loop?.userId !== ctx.userId)
          throw new ConvexError("That loop isn't yours, or it's gone.")
      }
    const row = { ...automation, name, nextRunAt: nextRunOf(automation.trigger, automation.active) }
    if (id) {
      await own(ctx, ctx.userId, id)
      await ctx.db.replace("automations", id, { ...row, userId: ctx.userId })
      return id
    }
    const mine = await ctx.db
      .query("automations")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
      .take(limits.automations)
    if (mine.length >= limits.automations)
      throw new ConvexError(`You can keep ${limits.automations} workflows.`)
    return ctx.db.insert("automations", { ...row, userId: ctx.userId })
  },
})

const setActive = authedMutation({
  args: { id: v.id("automations"), active: v.boolean() },
  returns: v.null(),
  handler: async (ctx, { id, active }) => {
    const automation = await own(ctx, ctx.userId, id)
    await ctx.db.patch("automations", id, {
      active,
      nextRunAt: nextRunOf(automation.trigger, active),
    })
    return null
  },
})

// A workflow's runs. Old ones are pruned as new ones start (see startRun), so there are
// only a few dozen, plus any still waiting.
const runsOf = (ctx: MutationCtx, automationId: Id<"automations">) =>
  ctx.db
    .query("automationRuns")
    .withIndex("by_automationId_and_startedAt", (q) => q.eq("automationId", automationId))
    .take(500)

/** Stops a workflow's runs, then deletes them, their Inbox lines and the workflow. */
const deleteWorkflow = async (ctx: MutationCtx, automation: Doc<"automations">) => {
  for (const run of await runsOf(ctx, automation._id))
    if (run.status === "running") await cancelRun(ctx, run)
  // Read again: stopping moved them to another count, and deleting goes by what's stored.
  await deleteRuns(ctx, await runsOf(ctx, automation._id))
  await ctx.db.delete("automations", automation._id)
}

/** Deletes a workflow: stops its runs and forgets their history. */
const remove = authedMutation({
  args: { id: v.id("automations") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    await deleteWorkflow(ctx, await own(ctx, ctx.userId, id))
    return null
  },
})

const runNow = authedMutation({
  args: { id: v.id("automations") },
  returns: v.id("automationRuns"),
  handler: async (ctx, { id }) => {
    const automation = await own(ctx, ctx.userId, id)
    const { ok } = await rates.limit(ctx, "automationRun", { key: ctx.userId })
    if (!ok) throw new ConvexError("That's enough runs for today. Try again tomorrow.")
    return startRun(ctx, automation, "manual")
  },
})

const stopRun = authedMutation({
  args: { runId: v.id("automationRuns") },
  returns: v.null(),
  handler: async (ctx, { runId }) => {
    const found = await ctx.db.get("automationRuns", runId)
    if (found?.userId !== ctx.userId) throw new ConvexError("That run isn't yours.")
    await cancelRun(ctx, found)
    return null
  },
})

// For account deletion.
export const deleteAutomations = async (ctx: MutationCtx, userId: Id<"users">) => {
  for await (const automation of ctx.db
    .query("automations")
    .withIndex("by_userId", (q) => q.eq("userId", userId)))
    await deleteWorkflow(ctx, automation)
}

export const publicApi = { list, counts, choices, runs, save, setActive, remove, runNow, stopRun }
