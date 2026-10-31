import { ConvexError } from "convex/values"
import type { Doc, Id } from "../../_generated/dataModel"
import { internal } from "../../_generated/api"
import type { MutationCtx } from "../../_generated/server"
import { canPrepare } from "../jobs/links"
import { switchAt } from "../loops/catalog"
import { usageOf } from "../loops/usage"
import { rowOf } from "../preferences/utils"
import { applyPool, limits } from "../workflows/manager"
import { apiKeyOf, monthlyCredits, monthOf } from "../workflows/sources"

export const sureEnough = 0.6

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

export const blockedBy = async (ctx: MutationCtx, userId: Id<"users">) => {
  const me = await ctx.db.get("users", userId)
  if (!me?.email) return "Add your email under Account first."
  if (!apiKeyOf("firecrawl")) return "Preparing applications needs a Firecrawl key."
  if (!(await rowOf(ctx, userId))?.resumeId) return "Upload a resume on the Resume page first."
}

export const enqueue = async (ctx: MutationCtx, id: Id<"prefills">) => {
  await applyPool.enqueueAction(
    ctx,
    internal.api.prefilledActions.prepareForm,
    { id },
    { retry: false, onComplete: internal.api.prefilled.ended, context: { id } }
  )
}

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

export const roomToPrepare = async (ctx: MutationCtx, userId: Id<"users">) => {
  const blocked = await blockedBy(ctx, userId)
  if (blocked) throw new ConvexError(blocked)
  const { ok } = await limits.limit(ctx, "prepare", { key: userId })
  if (!ok) throw new ConvexError("That's 10 prepared today. Try again tomorrow.")
}

const unsupported = "This works on Greenhouse, Lever, Ashby and Personio postings."

export const preparePosting = async (
  ctx: MutationCtx,
  userId: Id<"users">,
  { jobId, leadId }: { jobId?: Id<"jobs">; leadId?: Id<"jobLeads"> }
) => {
  const lead = leadId && (await ctx.db.get("jobLeads", leadId))
  if (lead && lead.userId !== userId) throw new ConvexError("That isn't yours.")
  const job = jobId ?? lead?.jobId
  const fromJob = job && (await ctx.db.get("jobs", job))
  const posting = fromJob ?? lead
  if (!posting) throw new ConvexError("That role is gone from the catalog.")
  if (!canPrepare(posting.url)) throw new ConvexError(unsupported)
  // Asking again for one already prepared costs nothing from the day's 10.
  const known = await prefillOf(ctx, userId, posting.urlKey)
  if (known && known.status !== "failed" && known.status !== "dismissed") return known._id
  await roomToPrepare(ctx, userId)
  return startPrefill(ctx, userId, {
    url: posting.url,
    urlKey: posting.urlKey,
    company: posting.company,
    title: posting.title,
    ...(job && { jobId: job }),
    ...(leadId && { leadId }),
  })
}

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
    if (!canPrepare(lead.url) || (await prefillOf(ctx, userId, lead.urlKey))) continue
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

export const withAnswer = (
  row: Doc<"prefills">,
  question: string,
  answer: string,
  source: "you" | "ai"
) => {
  const field = row.fields.find((f) => f.question === question)
  if (!field) throw new ConvexError("The form doesn't ask that.")
  if (answer && field.options && !field.options.includes(answer))
    throw new ConvexError("Pick one of the form's options.")
  return row.fields.map((f) => {
    if (f.question !== question) return f
    const { answer: _answer, entryKey: _entryKey, fill, ...rest } = f
    return {
      ...rest,
      source: answer ? source : ("none" as const),
      ...(answer && { answer }),
      ...(fill && f.answer === answer && { fill }),
    }
  })
}

export const ownPrefill = async (ctx: MutationCtx, userId: Id<"users">, id: Id<"prefills">) => {
  const row = await ctx.db.get("prefills", id)
  if (row?.userId !== userId) throw new ConvexError("That isn't yours.")
  return row
}
