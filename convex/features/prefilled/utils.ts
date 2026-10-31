import { ConvexError } from "convex/values"
import type { Doc, Id } from "../../_generated/dataModel"
import { internal } from "../../_generated/api"
import type { MutationCtx } from "../../_generated/server"
import { boardOf } from "../jobs/boards"
import { switchAt } from "../loops/catalog"
import { usageOf } from "../loops/utils"
import { rowOf } from "../preferences/utils"
import { applyPool, limits } from "../workflows/manager"
import { apiKeyOf, monthlyCredits, monthOf } from "../workflows/sources"

// Jev's pick counts only when it's sure; a weak pick is treated as none.
export const sureEnough = 0.6

// An open browser left alone closes by itself after this, so its credits don't run on.
export const liveMs = 15 * 60 * 1000

type Posting = {
  url: string
  urlKey: string
  company: string
  title: string
  jobId?: Id<"jobs">
  leadId?: Id<"jobLeads">
}

export const prefillOf = (ctx: MutationCtx, userId: Id<"users">, urlKey: string) =>
  ctx.db
    .query("prefills")
    .withIndex("by_userId_and_urlKey", (q) => q.eq("userId", userId).eq("urlKey", urlKey))
    .first()

/** Why this person can't prepare applications right now, if anything. */
export const blockedBy = async (ctx: MutationCtx, userId: Id<"users">) => {
  const me = await ctx.db.get("users", userId)
  if (!me?.email) return "Add your email under Account first."
  if (!apiKeyOf("firecrawl")) return "Preparing applications needs a Firecrawl key."
  if (!(await rowOf(ctx, userId))?.resumeId) return "Upload a resume on the Resume page first."
}

// Hands a row to the pool. `retry: false`: a prepare that dies waits for you to try again.
export const enqueue = async (ctx: MutationCtx, id: Id<"prefills">) => {
  await applyPool.enqueueAction(
    ctx,
    internal.prefilled.prepareForm,
    { id },
    { retry: false, onComplete: internal.prefilled.ended, context: { id } }
  )
}

/** Starts preparing a posting, once per person. Answers you typed are kept on a second go. */
export const startPrefill = async (ctx: MutationCtx, userId: Id<"users">, posting: Posting) => {
  const known = await prefillOf(ctx, userId, posting.urlKey)
  if (known && known.status !== "failed" && known.status !== "dismissed") return known._id
  const id = known
    ? known._id
    : await ctx.db.insert("prefills", { ...posting, userId, status: "preparing", fields: [] })
  if (known) await ctx.db.patch("prefills", id, { status: "preparing", error: undefined })
  await enqueue(ctx, id)
  return id
}

/** A loop's run put these on the shortlist: prepare the ones whose forms we can read, up to
 * the day's budget. Anything skipped keeps its Prepare button. Never throws: a loop's run
 * shouldn't fail because of this. */
export const prepareFits = async (
  ctx: MutationCtx,
  userId: Id<"users">,
  leads: Doc<"jobLeads">[]
) => {
  const me = await ctx.db.get("users", userId)
  if (me?.prepareAt === undefined || !leads.length) return
  if (await blockedBy(ctx, userId)) return
  const usage = await usageOf(ctx, "firecrawl", monthOf(Date.now()))
  if (usage?.exhaustedAt || (usage?.used ?? 0) >= monthlyCredits("firecrawl") * switchAt) return
  for (const lead of leads) {
    if (!boardOf(lead.url) || (await prefillOf(ctx, userId, lead.urlKey))) continue
    const { ok } = await limits.limit(ctx, "prepare", { key: userId })
    if (!ok) return
    await startPrefill(ctx, userId, {
      url: lead.url,
      urlKey: lead.urlKey,
      company: lead.company,
      title: lead.title,
      leadId: lead._id,
      ...(lead.jobId && { jobId: lead.jobId }),
    })
  }
}

export const ownPrefill = async (ctx: MutationCtx, userId: Id<"users">, id: Id<"prefills">) => {
  const row = await ctx.db.get("prefills", id)
  if (row?.userId !== userId) throw new ConvexError("That isn't yours.")
  return row
}

// For account deletion.
export const deletePrefills = async (ctx: MutationCtx, userId: Id<"users">) => {
  for await (const row of ctx.db
    .query("prefills")
    .withIndex("by_userId", (q) => q.eq("userId", userId)))
    await ctx.db.delete("prefills", row._id)
}

export const deleteAutoApplies = async (ctx: MutationCtx, userId: Id<"users">) => {
  for await (const row of ctx.db
    .query("autoApplies")
    .withIndex("by_userId_and_queuedAt", (q) => q.eq("userId", userId)))
    await ctx.db.delete("autoApplies", row._id)
}
