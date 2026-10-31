import { ConvexError, v } from "convex/values"
import schema from "../../schema"
import type { Id } from "../../_generated/dataModel"
import type { MutationCtx } from "../../_generated/server"
import { arkOutputToConvex } from "../../lib/ark"
import { arkMutation, authedMutation, authedQuery } from "../../lib/functions"
import { boardOf, previewOf } from "../jobs/boards"
import { rowLimits } from "../preferences/rows"
import { rowOf } from "../preferences/utils"
import { limits } from "../workflows/manager"
import { statusFrom } from "./match"
import { blockedBy, enqueue, ownPrefill, startPrefill } from "./utils"
import { maxListed, PrefillListed, SetAnswer, vLeadSummary } from "./validators"
import { logEdit } from "../activity/utils"

const settings = authedQuery({
  args: {},
  returns: v.object({ on: v.boolean() }),
  handler: async (ctx) => ({
    on: (await ctx.db.get("users", ctx.userId))?.prepareAt !== undefined,
  }),
})

const setAutoPrepare = authedMutation({
  args: { on: v.boolean() },
  returns: v.null(),
  handler: async (ctx, { on }) => {
    await ctx.db.patch("users", ctx.userId, { prepareAt: on ? Date.now() : undefined })
    await logEdit(
      ctx,
      ctx.userId,
      "account.prepare",
      on
        ? "Turned on preparing applications for new fits"
        : "Turned off preparing applications for new fits"
    )
    return null
  },
})

const roomToPrepare = async (ctx: MutationCtx, userId: Id<"users">) => {
  const blocked = await blockedBy(ctx, userId)
  if (blocked) throw new ConvexError(blocked)
  const { ok } = await limits.limit(ctx, "prepare", { key: userId })
  if (!ok) throw new ConvexError("That's 10 prepared today. Try again tomorrow.")
}

const unsupported = "This works on Greenhouse, Lever, Ashby and Personio postings."

const prepare = authedMutation({
  args: { jobId: v.optional(v.id("jobs")), leadId: v.optional(v.id("jobLeads")) },
  returns: v.id("prefills"),
  handler: async (ctx, { jobId, leadId }) => {
    const lead = leadId && (await ctx.db.get("jobLeads", leadId))
    if (lead && lead.userId !== ctx.userId) throw new ConvexError("That isn't yours.")
    const job = jobId ?? lead?.jobId
    const fromJob = job && (await ctx.db.get("jobs", job))
    const posting = fromJob ?? lead
    if (!posting) throw new ConvexError("That role is gone from the catalog.")
    if (!boardOf(posting.url)) throw new ConvexError(unsupported)
    await roomToPrepare(ctx, ctx.userId)
    return startPrefill(ctx, ctx.userId, {
      url: posting.url,
      urlKey: posting.urlKey,
      company: posting.company,
      title: posting.title,
      ...(job && { jobId: job }),
      ...(leadId && { leadId }),
    })
  },
})

const prepareAgain = authedMutation({
  args: { id: v.id("prefills") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const row = await ownPrefill(ctx, ctx.userId, id)
    if (row.status === "preparing" || row.status === "live" || row.status === "applied") return null
    await roomToPrepare(ctx, ctx.userId)
    await ctx.db.patch("prefills", id, { status: "preparing", error: undefined })
    await enqueue(ctx, id)
    return null
  },
})

const dismiss = authedMutation({
  args: { id: v.id("prefills") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const row = await ownPrefill(ctx, ctx.userId, id)
    if (row.status === "applied" || row.status === "live")
      throw new ConvexError("This one can't be dismissed now.")
    await ctx.db.patch("prefills", id, { status: "dismissed" })
    await logEdit(ctx, ctx.userId, "prefill.dismiss", `Dismissed ${row.title} · ${row.company}`, {
      prefillId: id,
    })
    return null
  },
})

const setAnswer = arkMutation({
  args: SetAnswer,
  returns: v.null(),
  handler: async (ctx, { id, question, answer, keep }) => {
    const row = await ownPrefill(ctx, ctx.userId, id)
    if (row.status === "applied") throw new ConvexError("This one can't be changed now.")
    const field = row.fields.find((f) => f.question === question)
    if (!field) throw new ConvexError("The form doesn't ask that.")
    if (answer && field.options && !field.options.includes(answer))
      throw new ConvexError("Pick one of the form's options.")
    const fields = row.fields.map((f) => {
      if (f.question !== question) return f
      const { answer: _answer, entryKey: _entryKey, fill, ...rest } = f
      return {
        ...rest,
        source: answer ? ("you" as const) : ("none" as const),
        ...(answer && { answer }),
        ...(fill && f.answer === answer && { fill }),
      }
    })
    await logEdit(
      ctx,
      ctx.userId,
      "prefill.answer",
      `Changed an answer on ${row.title} · ${row.company}`,
      { prefillId: id }
    )
    await ctx.db.patch("prefills", id, {
      fields,
      ...(row.status === "ready" || row.status === "needsAnswers"
        ? { status: statusFrom(fields) }
        : {}),
    })
    if (keep && answer) {
      const saved = await ctx.db
        .query("profileEntries")
        .withIndex("by_userId_and_kind_and_order", (q) =>
          q.eq("userId", ctx.userId).eq("kind", "field")
        )
        .order("desc")
        .take(rowLimits.field)
      const known = saved.find((e) => e.label === question)
      if (known) await ctx.db.patch("profileEntries", known._id, { value: answer })
      else {
        const own = saved.filter((e) => e.group === "Your questions")
        const order = own[0]
          ? own[0].order + 1
          : Math.floor((saved[0]?.order ?? -100) / 100 + 1) * 100
        await ctx.db.insert("profileEntries", {
          userId: ctx.userId,
          kind: "field",
          group: "Your questions",
          key: "field",
          label: question,
          value: answer,
          order,
        })
      }
    }
    return null
  },
})

const list = authedQuery({
  args: {},
  returns: v.array(arkOutputToConvex(PrefillListed)),
  handler: async (ctx) =>
    (
      await ctx.db
        .query("prefills")
        .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
        .order("desc")
        .take(maxListed)
    ).map(({ liveUrl: _liveUrl, scrapeId: _scrapeId, ...row }) => row),
})

const get = authedQuery({
  args: { id: v.id("prefills") },
  returns: v.union(
    v.null(),
    v.object({
      prefill: schema.doc("prefills"),
      lead: vLeadSummary,
      preview: v.string(),
      canDraft: v.boolean(),
    })
  ),
  handler: async (ctx, { id }) => {
    const prefill = await ctx.db.get("prefills", id)
    if (prefill?.userId !== ctx.userId) return null
    const lead = prefill.leadId
      ? await ctx.db.get("jobLeads", prefill.leadId)
      : await ctx.db
          .query("jobLeads")
          .withIndex("by_userId_and_urlKey", (q) =>
            q.eq("userId", ctx.userId).eq("urlKey", prefill.urlKey)
          )
          .first()
    const job = prefill.jobId && (await ctx.db.get("jobs", prefill.jobId))
    return {
      prefill,
      lead:
        lead && lead.userId === ctx.userId
          ? {
              fit: lead.fit,
              reasons: lead.reasons,
              ...(lead.verdict && { verdict: lead.verdict }),
              ...(lead.checks && { checks: lead.checks }),
              ...(lead.location && { location: lead.location }),
            }
          : null,
      preview: job ? previewOf(job.text) : (lead?.snippet ?? "").slice(0, 240),
      canDraft: Boolean((await rowOf(ctx, ctx.userId))?.resumeText),
    }
  },
})

export const publicApi = {
  settings,
  setAutoPrepare,
  prepare,
  prepareAgain,
  dismiss,
  setAnswer,
  list,
  get,
}
