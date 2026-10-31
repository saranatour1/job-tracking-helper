import { vOnCompleteArgs } from "@convex-dev/workpool"
import { ConvexError, v } from "convex/values"
import { components, internal } from "../../_generated/api"
import { internalMutation, internalQuery } from "../../_generated/server"
import { arkOutputToConvex } from "../../lib/ark"
import { workLog } from "../../lib/log"
import { changeStatus, nextNumber } from "../applications/utils"
import { addUsage } from "../loops/utils"
import { rowLimits } from "../preferences/rows"
import { rowOf } from "../preferences/utils"
import { statusFrom } from "./match"
import { liveMs } from "./utils"
import { PrefillField, vRunPlan, vSavePreparedArgs } from "./validators"

// Everything a run needs, read at once: the posting, what's prepared, the saved answers
// (keyed by the row they came from, so usage can be stamped), and the resume file.
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
    // Saved answers first: the first match wins, and yours beats the account's short name.
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

// A prepare is done. Answers you typed stay, a draft stays unless a saved answer now covers
// the question, and it tells the Inbox it's ready to look at.
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
    // Once: reading the form again isn't news.
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

// The pool's word when a prepare ends without finishing itself: it died or was canceled.
const ended = internalMutation({
  args: vOnCompleteArgs(v.object({ id: v.id("prefills") }), v.null()),
  returns: v.null(),
  handler: async (ctx, { result, context }) => {
    const row = await ctx.db.get("prefills", context.id)
    if (!row || result.kind === "success" || row.status !== "preparing") return null
    const error = result.kind === "failed" ? `Stopped: ${result.error.slice(0, 200)}` : "Stopped."
    await ctx.db.patch("prefills", row._id, { status: "failed", error })
    const log = workLog("prefill.prepare", { prefillId: row._id, userId: row.userId })
    log.set({ outcome: "failed", error })
    log.setLevel("error")
    log.emit()
    return null
  },
})

// You pressed Open browser: claims the row, so a second press can't open a second browser.
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
    await ctx.db.patch("prefills", id, { status: "live", error: undefined, unfilled: undefined })
    return null
  },
})

// The form is filled and the browser is open for you. It closes itself if left alone.
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
    await ctx.scheduler.runAfter(liveMs, internal.prefilled.closeLive, { id, scrapeId })
    return null
  },
})

// Back to where it was before Open browser. With `scrapeId`, only if that's still the session.
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

// You sent it. The posting becomes an application at Applied, or moves the one a loop
// already made, and the saved answers it used get their usage stamped. Once only.
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
    const lead = await ctx.db
      .query("jobLeads")
      .withIndex("by_userId_and_urlKey", (q) => q.eq("userId", userId).eq("urlKey", row.urlKey))
      .first()
    const linked = lead?.applicationId && (await ctx.db.get("applications", lead.applicationId))
    let applicationId
    if (linked && linked.trashedAt === undefined) {
      await changeStatus(ctx, linked, "applied", "Sent from Prefilled applications")
      applicationId = linked._id
    } else {
      const job = row.jobId && (await ctx.db.get("jobs", row.jobId))
      applicationId = await ctx.db.insert("applications", {
        userId,
        company: row.company,
        role: row.title,
        status: "applied",
        url: row.url,
        number: await nextNumber(ctx, userId),
        method: "Company site",
        ...(job?.location && { location: job.location }),
        labels: job?.remote ? ["Remote"] : [],
        history: [{ status: "applied", at: Date.now(), note: "Sent from Prefilled applications" }],
      })
      if (lead) await ctx.db.patch("jobLeads", lead._id, { status: "applied", applicationId })
    }
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

// One question went to the open browser: how it went, and what Firecrawl charged. `filled` is
// left out when there was no answer to put in, only a question to point at.
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
