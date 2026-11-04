import { defineBatchWorkerValidators, ping } from "@convex-dev/batch-worker"
import { v } from "convex/values"
import { components, internal } from "../../_generated/api"
import { internalMutation, internalQuery, query } from "../../_generated/server"
import { vSitemapRole as vRole } from "./validators"

const worker = "jobsSitemap"
const batchSize = 500

const { vQueryArgs, vQueryReturns, vMutationArgs, vMutationReturns } = defineBatchWorkerValidators({
  batch: { round: v.number(), roles: v.array(vRole), done: v.boolean() },
  cursor: v.object({ round: v.number(), after: v.number() }),
})

// Reading every role takes more queries than a crawler waits for, so the sitemap's roles are
// saved a batch at a time, in rounds. A round shows once its last batch is in.
const nextSitemap = internalQuery({
  args: vQueryArgs,
  returns: vQueryReturns,
  handler: async (ctx, { cursor }) => {
    const row = await ctx.db.query("jobCatalog").first()
    const round = row?.sitemapWanted
    if (!round || round === row.sitemapRound) return { kind: "idle" as const }
    const after = cursor?.round === round ? cursor.after : 0
    const jobs = await ctx.db
      .query("jobs")
      .withIndex("by_creation_time", (q) => q.gt("_creationTime", after))
      .take(batchSize)
    return {
      kind: "work" as const,
      batch: {
        round,
        roles: jobs.map(({ _id, title, company, postedAt }) => ({ _id, title, company, postedAt })),
        done: jobs.length < batchSize,
      },
      cursor: { round, after: jobs.at(-1)?._creationTime ?? after },
    }
  },
})

const addSitemap = internalMutation({
  args: vMutationArgs,
  returns: vMutationReturns,
  handler: async (ctx, { round, roles, done }) => {
    if (roles.length) await ctx.db.insert("sitemapPages", { round, roles })
    if (!done) return
    const row = await ctx.db.query("jobCatalog").first()
    if (!row) return
    // ponytail: drop `sitemap` from jobCatalog once this has run on production.
    if (row.sitemap) await ctx.storage.delete(row.sitemap)
    await ctx.db.patch("jobCatalog", row._id, { sitemapRound: round, sitemap: undefined })
    // ponytail: a round is about 30 pages, so one mutation clears the last one.
    const old = await ctx.db
      .query("sitemapPages")
      .withIndex("by_round", (q) => q.lt("round", round))
      .take(200)
    for (const page of old) await ctx.db.delete("sitemapPages", page._id)
  },
})

// Kicked as well, like the trends worker (get-convex/batch-worker#12).
const startSitemap = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const row = await ctx.db.query("jobCatalog").first()
    if (!row) return null
    await ctx.db.patch("jobCatalog", row._id, { sitemapWanted: Date.now() })
    await ping(ctx, components.batchWorker, {
      name: worker,
      workQuery: internal.api.jobs.nextSitemap,
      workerMutation: internal.api.jobs.addSitemap,
    })
    await ctx.runMutation(components.batchWorker.lib.kick, { name: worker })
    return null
  },
})

// By page, since an array holds at most 8,192 items.
const sitemapRoles = query({
  args: {},
  returns: v.array(v.array(vRole)),
  handler: async (ctx) => {
    const row = await ctx.db.query("jobCatalog").first()
    const round = row?.sitemapRound
    if (!round) return []
    const pages = await ctx.db
      .query("sitemapPages")
      .withIndex("by_round", (q) => q.eq("round", round))
      .collect()
    return pages.map((page) => page.roles)
  },
})

export const sitemapApi = { nextSitemap, addSitemap, startSitemap, sitemapRoles }
