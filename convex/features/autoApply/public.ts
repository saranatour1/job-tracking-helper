import { ConvexError, v } from "convex/values"
import schema from "../../schema"
import { authedMutation, authedQuery } from "../../lib/functions"
import { boardOf } from "../jobs/boards"
import { rowOf } from "../preferences/utils"
import { applyPool } from "../workflows/manager"
import { apiKeyOf } from "../workflows/sources"
import { maxListed } from "./validators"
import { enqueue, ready } from "./utils"

const settings = authedQuery({
  args: {},
  returns: v.object({ on: v.boolean(), dryRun: v.boolean(), ready: v.boolean() }),
  handler: async (ctx) => {
    const me = await ctx.db.get("users", ctx.userId)
    const prefs = await rowOf(ctx, ctx.userId)
    return {
      on: me?.autoApplyAt !== undefined,
      dryRun: me?.autoApplyDryRun ?? false,
      ready: Boolean(apiKeyOf("firecrawl")) && Boolean(prefs?.resumeId) && Boolean(me?.email),
    }
  },
})

// The switches under Account. Turning auto-apply off leaves queued runs to finish.
const setSwitch = authedMutation({
  args: { on: v.optional(v.boolean()), dryRun: v.optional(v.boolean()) },
  returns: v.null(),
  handler: async (ctx, { on, dryRun }) => {
    await ctx.db.patch("users", ctx.userId, {
      ...(on !== undefined && { autoApplyAt: on ? Date.now() : undefined }),
      ...(dryRun !== undefined && { autoApplyDryRun: dryRun || undefined }),
    })
    return null
  },
})

/** Puts a role from the catalog in the pile. One row per posting: queuing it again
 * returns the same row, and a posting that was sent is never queued again. */
const queue = authedMutation({
  args: { jobId: v.id("jobs"), dryRun: v.optional(v.boolean()) },
  returns: v.id("autoApplies"),
  handler: async (ctx, { jobId, dryRun }) => {
    const job = await ctx.db.get("jobs", jobId)
    if (!job) throw new ConvexError("That role is gone from the catalog.")
    if (!boardOf(job.url))
      throw new ConvexError("Auto-apply works on Greenhouse, Lever, Ashby and Personio postings.")
    const known = await ctx.db
      .query("autoApplies")
      .withIndex("by_userId_and_urlKey", (q) => q.eq("userId", ctx.userId).eq("urlKey", job.urlKey))
      .first()
    if (known?.status === "queued" || known?.status === "running") return known._id
    if (known?.submittedAt)
      throw new ConvexError("This one was already sent. Check your email before applying again.")
    await ready(ctx, ctx.userId)
    // Left out, the Account switch decides.
    dryRun ??= (await ctx.db.get("users", ctx.userId))?.autoApplyDryRun
    const fields = {
      userId: ctx.userId,
      jobId,
      urlKey: job.urlKey,
      url: job.url,
      company: job.company,
      title: job.title,
      status: "queued" as const,
      queuedAt: Date.now(),
      ...(dryRun && { dryRun }),
      used: [],
      missing: [],
    }
    const id = known?._id ?? (await ctx.db.insert("autoApplies", fields))
    if (known)
      await ctx.db.patch("autoApplies", id, {
        ...fields,
        dryRun,
        startedAt: undefined,
        finishedAt: undefined,
        confirmation: undefined,
        error: undefined,
      })
    const row = await ctx.db.get("autoApplies", id)
    if (row) await enqueue(ctx, row)
    return id
  },
})

// Runs a stopped row again, after you added answers or fixed what it needed.
const retry = authedMutation({
  args: { id: v.id("autoApplies") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const row = await ctx.db.get("autoApplies", id)
    if (row?.userId !== ctx.userId) throw new ConvexError("That isn't yours.")
    if (row.status === "queued" || row.status === "running") return null
    if (row.submittedAt)
      throw new ConvexError("This one was already sent. Check your email before applying again.")
    await ready(ctx, ctx.userId)
    await ctx.db.patch("autoApplies", id, {
      used: [],
      missing: [],
      error: undefined,
      confirmation: undefined,
      finishedAt: undefined,
      dryRun: undefined,
    })
    await enqueue(ctx, (await ctx.db.get("autoApplies", id))!)
    return null
  },
})

// Takes a queued row out of the pile; a running one finishes on its own.
const cancel = authedMutation({
  args: { id: v.id("autoApplies") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const row = await ctx.db.get("autoApplies", id)
    if (row?.userId !== ctx.userId) throw new ConvexError("That isn't yours.")
    if (row.status !== "queued") return null
    if (row.workId) await applyPool.cancel(ctx, row.workId as never)
    await ctx.db.patch("autoApplies", id, {
      status: "failed",
      error: "Taken out of the pile.",
      finishedAt: Date.now(),
      workId: undefined,
    })
    return null
  },
})

const list = authedQuery({
  args: {},
  returns: v.array(schema.doc("autoApplies")),
  handler: (ctx) =>
    ctx.db
      .query("autoApplies")
      .withIndex("by_userId_and_queuedAt", (q) => q.eq("userId", ctx.userId))
      .order("desc")
      .take(maxListed),
})

export const publicApi = { settings, setSwitch, queue, retry, cancel, list }
