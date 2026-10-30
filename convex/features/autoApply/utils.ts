import type { MutationCtx } from "../../_generated/server"
import type { Doc, Id } from "../../_generated/dataModel"
import { applyPool, limits } from "../workflows/manager"
import { internal } from "../../_generated/api"
import { ConvexError } from "convex/values"
import { apiKeyOf } from "../workflows/sources"
import { rowOf } from "../preferences/utils"

// Hands a row to the pool. `retry: false`: a run that dies is never rerun by itself.
export const enqueue = async (ctx: MutationCtx, row: Doc<"autoApplies">) => {
  const workId = await applyPool.enqueueAction(
    ctx,
    internal.autoApply.run,
    { autoApplyId: row._id },
    { retry: false, onComplete: internal.autoApply.ended, context: { autoApplyId: row._id } }
  )
  await ctx.db.patch("autoApplies", row._id, { workId, status: "queued", queuedAt: Date.now() })
}

export const ready = async (ctx: MutationCtx, userId: Id<"users">) => {
  const me = await ctx.db.get("users", userId)
  if (me?.autoApplyAt === undefined)
    throw new ConvexError("Turn on auto-apply under Account first.")
  if (!me.email) throw new ConvexError("Add your email under Account first.")
  if (!apiKeyOf("firecrawl")) throw new ConvexError("Auto-apply needs a Firecrawl key.")
  const prefs = await rowOf(ctx, userId)
  if (!prefs?.resumeId) throw new ConvexError("Upload a resume on the Resume page first.")
  const { ok } = await limits.limit(ctx, "autoApply", { key: userId })
  if (!ok) throw new ConvexError("That's 10 auto-applies today. Try again tomorrow.")
}

// For account deletion.
export const deleteAutoApplies = async (ctx: MutationCtx, userId: Id<"users">) => {
  for await (const row of ctx.db
    .query("autoApplies")
    .withIndex("by_userId_and_queuedAt", (q) => q.eq("userId", userId)))
    await ctx.db.delete("autoApplies", row._id)
}

// Jev's pick counts only when it's sure; a weak pick is treated as none.
export const sureEnough = 0.6

// The run stops short of the submit click when less than this is left of the action.
export const actionMs = 10 * 60 * 1000

export const submitNeedsMs = 90 * 1000
