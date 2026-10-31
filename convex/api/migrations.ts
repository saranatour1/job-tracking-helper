import { v } from "convex/values"
import { internal } from "../_generated/api"
import { internalMutation, internalQuery } from "../_generated/server"
import { defaultShow } from "../features/loops/catalog"
import type { Step } from "../features/automations/validators"

const vCursor = { cursor: v.optional(v.union(v.string(), v.null())) }

export const fillShows = internalMutation({
  args: vCursor,
  returns: v.null(),
  handler: async (ctx, { cursor }) => {
    const page = await ctx.db.query("loops").paginate({ cursor: cursor ?? null, numItems: 100 })
    for (const loop of page.page)
      if (loop.show === undefined) await ctx.db.patch("loops", loop._id, { show: defaultShow })
    if (!page.isDone)
      await ctx.scheduler.runAfter(0, internal.api.migrations.fillShows, {
        cursor: page.continueCursor,
      })
    return null
  },
})

// Reads have always shown a lead with no verdict as a fit, so this keeps what people see.
export const fillVerdicts = internalMutation({
  args: vCursor,
  returns: v.null(),
  handler: async (ctx, { cursor }) => {
    const page = await ctx.db.query("jobLeads").paginate({ cursor: cursor ?? null, numItems: 100 })
    for (const lead of page.page)
      if (lead.verdict === undefined) await ctx.db.patch("jobLeads", lead._id, { verdict: "fit" })
    if (!page.isDone)
      await ctx.scheduler.runAfter(0, internal.api.migrations.fillVerdicts, {
        cursor: page.continueCursor,
      })
    return null
  },
})

const lacksId = (step: Step) => step.kind === "decide" && step.id === undefined

// Choice counts are keyed by the step's position when it has no id, so using that
// position as the id keeps the counts already recorded.
const withIds = (steps: Step[]) =>
  steps.map((step, i) => (lacksId(step) ? { ...step, id: String(i) } : step))

export const fillAutomationIds = internalMutation({
  args: vCursor,
  returns: v.null(),
  handler: async (ctx, { cursor }) => {
    const page = await ctx.db
      .query("automations")
      .paginate({ cursor: cursor ?? null, numItems: 100 })
    for (const row of page.page)
      if (row.steps.some(lacksId))
        await ctx.db.patch("automations", row._id, { steps: withIds(row.steps) })
    if (!page.isDone)
      await ctx.scheduler.runAfter(0, internal.api.migrations.fillAutomationIds, {
        cursor: page.continueCursor,
      })
    return null
  },
})

export const fillRunIds = internalMutation({
  args: vCursor,
  returns: v.null(),
  handler: async (ctx, { cursor }) => {
    const page = await ctx.db
      .query("automationRuns")
      .paginate({ cursor: cursor ?? null, numItems: 100 })
    for (const row of page.page)
      if (row.steps.some(lacksId))
        await ctx.db.patch("automationRuns", row._id, { steps: withIds(row.steps) })
    if (!page.isDone)
      await ctx.scheduler.runAfter(0, internal.api.migrations.fillRunIds, {
        cursor: page.continueCursor,
      })
    return null
  },
})

export const left = internalQuery({
  args: {},
  returns: v.any(),
  handler: async (ctx) => {
    const out = { boxes: 0, shows: 0, verdicts: 0, automationIds: 0, runIds: 0 }
    for await (const e of ctx.db.query("mailEvents")) if (e.box === undefined) out.boxes++
    for await (const l of ctx.db.query("loops")) if (l.show === undefined) out.shows++
    for await (const l of ctx.db.query("jobLeads")) if (l.verdict === undefined) out.verdicts++
    for await (const a of ctx.db.query("automations")) if (a.steps.some(lacksId)) out.automationIds++
    for await (const r of ctx.db.query("automationRuns")) if (r.steps.some(lacksId)) out.runIds++
    return out
  },
})
