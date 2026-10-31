import { vOnCompleteArgs } from "@convex-dev/workpool"
import { ConvexError, v } from "convex/values"
import { components, internal } from "../../_generated/api"
import type { Doc } from "../../_generated/dataModel"
import { internalMutation, internalQuery, type MutationCtx } from "../../_generated/server"
import { arkOutputToConvex } from "../../lib/ark"
import { workLog } from "../../lib/log"
import { keepLog } from "../activity/utils"
import { changeStatus, logNewApplication, nextNumber } from "../applications/utils"
import { companyAddress } from "../email/addresses"
import { trackingAddressOf } from "../email/utils"
import { addUsage } from "../loops/utils"
import { rowLimits } from "../preferences/rows"
import { rowOf } from "../preferences/utils"
import { isEmailQuestion, statusFrom } from "./match"
import { liveMs } from "./utils"
import { PrefillField, vRunPlan, vSavePreparedArgs } from "./validators"

const plan = internalQuery({
  args: { id: v.id("prefills") },
  returns: vRunPlan,
  handler: async (ctx, { id }) => {
    const row = await ctx.db.get("prefills", id)
    if (!row) return null
    const me = await ctx.db.get("users", row.userId)
    const prefs = await rowOf(ctx, row.userId)
    const entries = await ctx.db
      .query("profileEntries")
      .withIndex("by_userId_and_kind_and_order", (q) => q.eq("userId", row.userId))
      .take(rowLimits.answer + rowLimits.field)
    const answers = [
      ...entries
        .filter((e) => e.value.trim())
        .map((e) => ({ key: e._id as string, label: e.label, value: e.value })),
      ...(me?.name ? [{ key: "user.name", label: "Full name", value: me.name }] : []),
      ...(me?.email ? [{ key: "user.email", label: "Email", value: me.email }] : []),
    ]
    const file = prefs?.resumeId && (await ctx.db.system.get("_storage", prefs.resumeId))
    const job = row.jobId && (await ctx.db.get("jobs", row.jobId))
    const lead = row.leadId && (await ctx.db.get("jobLeads", row.leadId))
    return {
      userId: row.userId,
      url: row.url,
      status: row.status,
      fields: row.fields,
      answers,
      company: row.company,
      title: row.title,
      postingText: job ? job.text : (lead?.snippet ?? ""),
      resumeText: prefs?.resumeText ?? "",
      resume: file
        ? {
            id: file._id,
            name: prefs.resumeName ?? "resume.pdf",
            mimeType: file.contentType ?? "application/pdf",
          }
        : null,
    }
  },
})

const savePrepared = internalMutation({
  args: vSavePreparedArgs,
  returns: v.null(),
  handler: async (ctx, { id, fields, credits, aiUnavailable }) => {
    const row = await ctx.db.get("prefills", id)
    if (row?.status !== "preparing") return null
    if (credits) await addUsage(ctx, "firecrawl", credits, false)
    const earlier = new Map(
      row.fields
        .filter((f) => f.answer && (f.source === "you" || f.source === "ai"))
        .map((f) => [f.question, f])
    )
    const merged = fields.map((f) => {
      const had = earlier.get(f.question)
      if (!had || (had.source === "ai" && f.answer)) return f
      const { entryKey: _entryKey, ...rest } = f
      return { ...rest, answer: had.answer, source: had.source }
    })
    await ctx.db.patch("prefills", id, {
      fields: merged,
      status: statusFrom(merged),
      preparedAt: Date.now(),
      credits: (row.credits ?? 0) + credits,
      error: undefined,
      aiUnavailable,
    })
    if (!row.preparedAt)
      await ctx.runMutation(components.notifications.lib.notify, {
        owner: row.userId,
        kind: "prefill.ready",
        ref: id,
      })
    return null
  },
})

const fail = internalMutation({
  args: { id: v.id("prefills"), error: v.string(), credits: v.number() },
  returns: v.null(),
  handler: async (ctx, { id, error, credits }) => {
    const row = await ctx.db.get("prefills", id)
    if (row?.status !== "preparing") return null
    if (credits) await addUsage(ctx, "firecrawl", credits, false)
    await ctx.db.patch("prefills", id, {
      status: "failed",
      error,
      credits: (row.credits ?? 0) + credits,
    })
    return null
  },
})

const ended = internalMutation({
  args: vOnCompleteArgs(v.object({ id: v.id("prefills") }), v.null()),
  returns: v.null(),
  handler: async (ctx, { result, context }) => {
    const row = await ctx.db.get("prefills", context.id)
    if (!row || result.kind === "success" || row.status !== "preparing") return null
    const error = result.kind === "failed" ? `Stopped: ${result.error.slice(0, 200)}` : "Stopped."
    await ctx.db.patch("prefills", row._id, { status: "failed", error })
    const log = workLog("prefill.prepare", { prefillId: row._id, userId: row.userId })
    log.set({ summary: `${row.title} · ${row.company}`, outcome: "failed", error })
    log.setLevel("error")
    await keepLog(ctx, log)
    return null
  },
})

const linkedTo = async (ctx: MutationCtx, row: Doc<"prefills">) => {
  const lead = await ctx.db
    .query("jobLeads")
    .withIndex("by_userId_and_urlKey", (q) => q.eq("userId", row.userId).eq("urlKey", row.urlKey))
    .first()
  const id = row.applicationId ?? lead?.applicationId
  const found = id && (await ctx.db.get("applications", id))
  const application = found && found.trashedAt === undefined ? found : null
  return { application, lead }
}

const newApplication = async (
  ctx: MutationCtx,
  row: Doc<"prefills">,
  status: "saved" | "applied",
  note?: string
) => {
  const job = row.jobId && (await ctx.db.get("jobs", row.jobId))
  const applicationId = await ctx.db.insert("applications", {
    userId: row.userId,
    company: row.company,
    role: row.title,
    status,
    url: row.url,
    number: await nextNumber(ctx, row.userId),
    method: "Company site",
    ...(job?.location && { location: job.location }),
    labels: job?.remote ? ["Remote"] : [],
    history: [{ status, at: Date.now(), ...(note && { note }) }],
  })
  await logNewApplication(ctx, row.userId, applicationId, row.company)
  return applicationId
}

const beginLive = internalMutation({
  args: { userId: v.id("users"), id: v.id("prefills") },
  returns: v.null(),
  handler: async (ctx, { userId, id }) => {
    const row = await ctx.db.get("prefills", id)
    if (row?.userId !== userId) throw new ConvexError("That isn't yours.")
    if (row.status !== "ready" && row.status !== "needsAnswers")
      throw new ConvexError(
        row.status === "live" ? "This one is already open." : "This one isn't ready to open."
      )
    const tracking = await trackingAddressOf(ctx, userId)
    let tagged
    if (tracking) {
      const { application, lead } = await linkedTo(ctx, row)
      const applicationId = application?._id ?? (await newApplication(ctx, row, "saved"))
      if (lead) await ctx.db.patch("jobLeads", lead._id, { applicationId })
      tagged = { applicationId, address: companyAddress(tracking, row.company) }
    }
    await ctx.db.patch("prefills", id, {
      status: "live",
      error: undefined,
      unfilled: undefined,
      ...(tagged && {
        applicationId: tagged.applicationId,
        fields: row.fields.map((f) =>
          f.source === "saved" && isEmailQuestion(f.question) ? { ...f, answer: tagged.address } : f
        ),
      }),
    })
    return null
  },
})

const goLive = internalMutation({
  args: {
    id: v.id("prefills"),
    scrapeId: v.string(),
    liveUrl: v.string(),
    unfilled: v.array(v.string()),
    spots: v.array(v.object({ question: v.string(), selector: v.string() })),
    credits: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, { id, scrapeId, liveUrl, unfilled, spots, credits }) => {
    const row = await ctx.db.get("prefills", id)
    if (row?.status !== "live") return null
    if (credits) await addUsage(ctx, "firecrawl", credits, false)
    const where = new Map(spots.map((s) => [s.question, s.selector]))
    const missed = new Set(unfilled)
    await ctx.db.patch("prefills", id, {
      fields: row.fields.map(({ selector: _old, fill: _fill, ...f }) => {
        const selector = where.get(f.question)
        const fill = missed.has(f.question) ? "byHand" : f.answer && selector ? "filled" : undefined
        return {
          ...f,
          ...(selector && { selector }),
          ...(fill && { fill: fill as "filled" | "byHand" }),
        }
      }),
      scrapeId,
      liveUrl,
      unfilled,
      credits: (row.credits ?? 0) + credits,
    })
    await ctx.scheduler.runAfter(liveMs, internal.api.prefilled.closeLive, { id, scrapeId })
    return null
  },
})

const endLive = internalMutation({
  args: {
    id: v.id("prefills"),
    scrapeId: v.optional(v.string()),
    error: v.optional(v.string()),
    credits: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, { id, scrapeId, error, credits }) => {
    const row = await ctx.db.get("prefills", id)
    if (row?.status !== "live" || (scrapeId && row.scrapeId !== scrapeId)) return null
    if (credits) await addUsage(ctx, "firecrawl", credits, false)
    await ctx.db.patch("prefills", id, {
      status: statusFrom(row.fields),
      liveUrl: undefined,
      scrapeId: undefined,
      unfilled: undefined,
      error,
      credits: (row.credits ?? 0) + (credits ?? 0),
    })
    return null
  },
})

const finish = internalMutation({
  args: {
    userId: v.id("users"),
    id: v.id("prefills"),
    confirmation: v.string(),
    credits: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, { userId, id, confirmation, credits }) => {
    const row = await ctx.db.get("prefills", id)
    if (row?.userId !== userId) throw new ConvexError("That isn't yours.")
    if (row.status !== "live") return null
    if (credits) await addUsage(ctx, "firecrawl", credits, false)
    const { application, lead } = await linkedTo(ctx, row)
    let applicationId
    if (application) {
      await changeStatus(ctx, application, "applied", "Sent from Prefilled applications")
      applicationId = application._id
    } else {
      applicationId = await newApplication(ctx, row, "applied", "Sent from Prefilled applications")
    }
    if (lead) await ctx.db.patch("jobLeads", lead._id, { status: "applied", applicationId })
    for (const { entryKey } of row.fields) {
      const entryId = entryKey && ctx.db.normalizeId("profileEntries", entryKey)
      const entry = entryId && (await ctx.db.get("profileEntries", entryId))
      if (entry && entry.userId === userId)
        await ctx.db.patch("profileEntries", entry._id, {
          lastUsedAt: Date.now(),
          useCount: (entry.useCount ?? 0) + 1,
        })
    }
    await ctx.db.patch("prefills", id, {
      status: "applied",
      applicationId,
      confirmation,
      sentAt: Date.now(),
      liveUrl: undefined,
      scrapeId: undefined,
      unfilled: undefined,
      credits: (row.credits ?? 0) + credits,
    })
    const log = workLog("prefill.sent", { prefillId: id, userId, applicationId })
    log.set({ summary: `${row.title} · ${row.company}`, outcome: "sent" })
    await keepLog(ctx, log)
    return null
  },
})

const session = internalQuery({
  args: { id: v.id("prefills") },
  returns: v.union(
    v.null(),
    v.object({
      userId: v.id("users"),
      status: v.string(),
      scrapeId: v.optional(v.string()),
      fields: arkOutputToConvex(PrefillField.array()),
    })
  ),
  handler: async (ctx, { id }) => {
    const row = await ctx.db.get("prefills", id)
    return (
      row && { userId: row.userId, status: row.status, scrapeId: row.scrapeId, fields: row.fields }
    )
  },
})

const sent = internalMutation({
  args: {
    id: v.id("prefills"),
    question: v.string(),
    filled: v.optional(v.boolean()),
    credits: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, { id, question, filled, credits }) => {
    const row = await ctx.db.get("prefills", id)
    if (!row) return null
    await addUsage(ctx, "firecrawl", credits, false)
    const others = (row.unfilled ?? []).filter((q) => q !== question)
    await ctx.db.patch("prefills", id, {
      credits: (row.credits ?? 0) + credits,
      ...(filled !== undefined && {
        fields: row.fields.map((f) =>
          f.question === question
            ? { ...f, fill: filled ? ("filled" as const) : ("byHand" as const) }
            : f
        ),
        unfilled: filled ? others : [...others, question],
      }),
    })
    return null
  },
})

export const internalApi = {
  plan,
  savePrepared,
  fail,
  ended,
  beginLive,
  goLive,
  endLive,
  finish,
  session,
  sent,
}
