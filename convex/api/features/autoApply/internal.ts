import { vOnCompleteArgs } from "@convex-dev/workpool"
import { v } from "convex/values"
import { components } from "../../../_generated/api"
import type { Id } from "../../../_generated/dataModel"
import { internalMutation, internalQuery } from "../../../_generated/server"
import { arkOutputToConvex } from "../../../lib/ark"
import { workLog } from "../../../lib/log"
import { changeStatus, nextNumber } from "../applications/public"
import { addUsage } from "../loops/internal"
import { rowOf } from "../preferences/public"
import { rowLimits } from "../preferences/rows"
import { applyStatuses, MissingQuestion, UsedAnswer } from "./models"

const vStatus = v.union(...applyStatuses.map((s) => v.literal(s)))

// Everything one run needs, read at once: the posting, the saved answers (keyed by
// the row they came from, so usage can be stamped), and the resume file.
const plan = internalQuery({
  args: { autoApplyId: v.id("autoApplies") },
  returns: v.union(
    v.null(),
    v.object({
      userId: v.id("users"),
      url: v.string(),
      dryRun: v.boolean(),
      answers: v.array(v.object({ key: v.string(), label: v.string(), value: v.string() })),
      resume: v.union(
        v.null(),
        v.object({ id: v.id("_storage"), name: v.string(), mimeType: v.string() })
      ),
    })
  ),
  handler: async (ctx, { autoApplyId }) => {
    const row = await ctx.db.get("autoApplies", autoApplyId)
    if (!row) return null
    const me = await ctx.db.get("users", row.userId)
    const prefs = await rowOf(ctx, row.userId)
    const entries = await ctx.db
      .query("profileEntries")
      .withIndex("by_userId_and_kind_and_order", (q) => q.eq("userId", row.userId))
      .take(rowLimits.answer + rowLimits.field)
    const answers = [
      ...(me?.name ? [{ key: "user.name", label: "Full name", value: me.name }] : []),
      ...(me?.email ? [{ key: "user.email", label: "Email", value: me.email }] : []),
      ...entries
        .filter((e) => e.value.trim())
        .map((e) => ({ key: e._id as string, label: e.label, value: e.value })),
    ]
    const file = prefs?.resumeId && (await ctx.db.system.get("_storage", prefs.resumeId))
    return {
      userId: row.userId,
      url: row.url,
      dryRun: row.dryRun ?? false,
      answers,
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

// queued → running. Anything else means the row was canceled or already ran.
const claim = internalMutation({
  args: { autoApplyId: v.id("autoApplies") },
  returns: v.boolean(),
  handler: async (ctx, { autoApplyId }) => {
    const row = await ctx.db.get("autoApplies", autoApplyId)
    if (row?.status !== "queued") return false
    await ctx.db.patch("autoApplies", autoApplyId, { status: "running", startedAt: Date.now() })
    return true
  },
})

// The fence before the submit click: once set, this posting is never submitted again.
const markSubmitting = internalMutation({
  args: { autoApplyId: v.id("autoApplies") },
  returns: v.boolean(),
  handler: async (ctx, { autoApplyId }) => {
    const row = await ctx.db.get("autoApplies", autoApplyId)
    if (!row || row.status !== "running" || row.submittedAt) return false
    await ctx.db.patch("autoApplies", autoApplyId, { submittedAt: Date.now() })
    return true
  },
})

// Records how the run went. On applied, the posting becomes an application and the
// answers used get their usage stamped; applied and needs-you reach the Inbox.
const finish = internalMutation({
  args: {
    autoApplyId: v.id("autoApplies"),
    status: vStatus,
    used: v.optional(arkOutputToConvex(UsedAnswer.array())),
    missing: v.optional(arkOutputToConvex(MissingQuestion.array())),
    confirmation: v.optional(v.string()),
    error: v.optional(v.string()),
    credits: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (
    ctx,
    { autoApplyId, status, used = [], missing = [], confirmation, error, credits }
  ) => {
    const row = await ctx.db.get("autoApplies", autoApplyId)
    if (row?.status !== "running") return null
    if (credits) await addUsage(ctx, "firecrawl", credits, false)
    let applicationId = row.applicationId
    if (status === "applied") {
      const lead = await ctx.db
        .query("jobLeads")
        .withIndex("by_userId_and_urlKey", (q) =>
          q.eq("userId", row.userId).eq("urlKey", row.urlKey)
        )
        .first()
      const linked = lead?.applicationId && (await ctx.db.get("applications", lead.applicationId))
      if (linked && linked.trashedAt === undefined) {
        await changeStatus(ctx, linked, "applied", "Sent by auto-apply")
        applicationId = linked._id
      } else {
        const job = row.jobId && (await ctx.db.get("jobs", row.jobId))
        applicationId = await ctx.db.insert("applications", {
          userId: row.userId,
          company: row.company,
          role: row.title,
          status: "applied",
          url: row.url,
          number: await nextNumber(ctx, row.userId),
          method: "Company site",
          ...(job?.location && { location: job.location }),
          labels: job?.remote ? ["Remote"] : [],
          history: [{ status: "applied", at: Date.now(), note: "Sent by auto-apply" }],
        })
        if (lead) await ctx.db.patch("jobLeads", lead._id, { status: "applied", applicationId })
      }
      for (const { key } of used) {
        const entryId = ctx.db.normalizeId("profileEntries", key)
        const entry = entryId && (await ctx.db.get("profileEntries", entryId))
        if (entry && entry.userId === row.userId)
          await ctx.db.patch("profileEntries", entry._id, {
            lastUsedAt: Date.now(),
            useCount: (entry.useCount ?? 0) + 1,
          })
      }
    }
    if (status === "applied" || status === "needsYou")
      await ctx.runMutation(components.notifications.lib.notify, {
        owner: row.userId,
        kind: status === "applied" ? "apply.done" : "apply.needsYou",
        ref: row._id,
      })
    await ctx.db.patch("autoApplies", autoApplyId, {
      status,
      used,
      missing,
      confirmation,
      error,
      ...(credits && { credits: (row.credits ?? 0) + credits }),
      applicationId,
      finishedAt: Date.now(),
      workId: undefined,
    })
    return null
  },
})

// The pool's word when a run ends without finishing itself: it died or was canceled.
const ended = internalMutation({
  args: vOnCompleteArgs(v.object({ autoApplyId: v.id("autoApplies") }), v.null()),
  returns: v.null(),
  handler: async (ctx, { result, context }) => {
    const row = await ctx.db.get("autoApplies", context.autoApplyId)
    if (!row || result.kind === "success" || row.status !== "running") return null
    const error = row.submittedAt
      ? "Sent, but the run stopped before it saw a confirmation. Check your email."
      : result.kind === "failed"
        ? `Stopped before sending: ${result.error.slice(0, 200)}`
        : "Stopped before sending."
    await ctx.db.patch("autoApplies", row._id, {
      status: "failed",
      error,
      finishedAt: Date.now(),
      workId: undefined,
    })
    const log = workLog("autoApply.run", { autoApplyId: row._id, userId: row.userId })
    log.set({ outcome: "failed", error })
    log.setLevel("error")
    log.emit()
    return null
  },
})

export const internalApi = { plan, claim, markSubmitting, finish, ended }
export type { Id }
