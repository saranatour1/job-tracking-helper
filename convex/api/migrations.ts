import { defineBatchWorkerValidators, ping } from "@convex-dev/batch-worker"
import { v } from "convex/values"
import { components, internal } from "../_generated/api"
import { internalMutation, internalQuery } from "../_generated/server"
import { fitOf } from "../features/applications/utils"
import { syncMailSummary } from "../features/email/utils"
import { companyOf, nonTechStarters, techFeeds } from "../features/jobs/boards"
import { isCompanyBoard } from "../features/jobs/boards"
import { deleteJob, fillBoard, markCounted, recount, roleCounts } from "../features/jobs/counts"
import { countCatalog } from "../features/jobs/utils"
import { roleKey, urlKey } from "../features/workflows/fit"

// One-off: researches every board that has roles, in batches, until none is left. The cron also
// starts this as soon as it's deployed, so here it's for checking on or nudging. Spends about 2
// Firecrawl credits for each board not posting on its own site, 4 searches a minute, and stops
// searching near the month's limit. Safe to run again:
//   npx convex run api/migrations:fillCompanies
//   npx convex run api/migrations:companiesLeft
// Delete it once that's done everywhere.
export const fillCompanies = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    await ctx.scheduler.runAfter(0, internal.api.jobs.researchDue, {})
    return null
  },
})

// Company boards with roles and no company row. Zero once the fill has finished.
export const companiesLeft = internalQuery({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    let left = 0
    for await (const board of ctx.db.query("jobBoards"))
      if (board.jobs && !board.companyId && isCompanyBoard(board.kind)) left++
    return left
  },
})

// One-off: moves stored postings to the keys that stay the same across links, and gives leads
// their role. Until it's run, a refresh saves Greenhouse roles a second time and loops can show
// a role again. Run it right after deploying, on each deployment. Safe to run again:
//   npx convex run api/migrations:fillPostingKeys
//   npx convex run api/migrations:postingKeysLeft
// Delete it once that's done everywhere.
export const fillPostingKeys = internalMutation({
  args: {
    table: v.optional(v.union(v.literal("jobs"), v.literal("jobLeads"), v.literal("prefills"))),
    cursor: v.optional(v.union(v.string(), v.null())),
  },
  returns: v.null(),
  handler: async (ctx, { table = "jobs", cursor }) => {
    const jobByKey = (key: string) =>
      ctx.db
        .query("jobs")
        .withIndex("by_urlKey", (q) => q.eq("urlKey", key))
        .first()
    const opts = { cursor: cursor ?? null, numItems: 100 }
    let page
    if (table === "jobs") {
      page = await ctx.db.query("jobs").paginate(opts)
      for (const job of page.page) {
        const key = urlKey(job.url)
        if (key === job.urlKey) continue
        // A refresh got there first and saved it under the new key. Leads move over below.
        if (await jobByKey(key)) {
          await deleteJob(ctx, job)
          await recount(ctx, job.boardId)
        } else await ctx.db.patch("jobs", job._id, { urlKey: key })
      }
    } else if (table === "jobLeads") {
      page = await ctx.db.query("jobLeads").paginate(opts)
      for (const lead of page.page) {
        const key = urlKey(lead.url)
        const job = await jobByKey(key)
        await ctx.db.patch("jobLeads", lead._id, {
          urlKey: key,
          roleKey: roleKey(lead),
          ...(job && { jobId: job._id }),
        })
      }
    } else {
      page = await ctx.db.query("prefills").paginate(opts)
      for (const prefill of page.page)
        await ctx.db.patch("prefills", prefill._id, { urlKey: urlKey(prefill.url) })
    }
    const next = table === "jobs" ? "jobLeads" : "prefills"
    if (!page.isDone)
      await ctx.scheduler.runAfter(0, internal.api.migrations.fillPostingKeys, {
        table,
        cursor: page.continueCursor,
      })
    else if (table !== "prefills")
      await ctx.scheduler.runAfter(0, internal.api.migrations.fillPostingKeys, { table: next })
    return null
  },
})

// Leads and prefills on an old key, which fill after jobs. Zero once the fill has finished.
export const postingKeysLeft = internalQuery({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    let left = 0
    for await (const lead of ctx.db.query("jobLeads"))
      if (lead.roleKey === undefined || lead.urlKey !== urlKey(lead.url)) left++
    for await (const prefill of ctx.db.query("prefills"))
      if (prefill.urlKey !== urlKey(prefill.url)) left++
    return left
  },
})

// One-off: gives existing applications the mail summary and fit the board now reads off them,
// and counts the job catalog. Until it's run, cards show no mail or fit badge and Jobs no
// totals. Safe to run again. Run it on each deployment:
//   npx convex run api/migrations:fillBoardFields
//   npx convex run api/migrations:boardFieldsLeft
// Delete it once that's done everywhere.
export const fillBoardFields = internalMutation({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  returns: v.null(),
  handler: async (ctx, { cursor }) => {
    if (!cursor) await countCatalog(ctx, {})
    const page = await ctx.db
      .query("applications")
      .paginate({ cursor: cursor ?? null, numItems: 50 })
    for (const application of page.page) {
      await syncMailSummary(ctx, application._id)
      if (application.fit !== undefined) continue
      const lead = await ctx.db
        .query("jobLeads")
        .withIndex("by_applicationId", (q) => q.eq("applicationId", application._id))
        .first()
      if (lead) await ctx.db.patch("applications", application._id, fitOf(lead))
    }
    if (!page.isDone)
      await ctx.scheduler.runAfter(0, internal.api.migrations.fillBoardFields, {
        cursor: page.continueCursor,
      })
    return null
  },
})

// Applications with mail but no summary. Zero once the fill has finished.
export const boardFieldsLeft = internalQuery({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const filled = new Set<string>()
    for await (const application of ctx.db.query("applications"))
      if (application.mail) filled.add(application._id)
    const left = new Set<string>()
    for await (const { applicationId, box } of ctx.db.query("mailEvents"))
      if (applicationId && box !== "trash" && !filled.has(applicationId)) left.add(applicationId)
    return left.size
  },
})

// One-off: starter boards are only added to an empty catalog, so this gives an existing one the
// non-tech companies and the tech feeds. Safe to run again. Run it on each deployment:
//   npx convex run api/migrations:addNewStarters
// Delete it once that's done everywhere.
export const addNewStarters = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    let added = 0
    for (const b of [...nonTechStarters, ...techFeeds]) {
      const known = await ctx.db
        .query("jobBoards")
        .withIndex("by_kind_and_slug", (q) => q.eq("kind", b.kind).eq("slug", b.slug))
        .first()
      if (known) continue
      await ctx.db.insert("jobBoards", {
        ...b,
        company: companyOf(b.slug),
        addedAt: Date.now(),
        jobs: 0,
        counted: true,
      })
      added++
    }
    if (added) await countCatalog(ctx, { boards: added })
    return added
  },
})

const jobCountsWorker = "jobCounts"

const counting = defineBatchWorkerValidators({
  batch: {
    jobIds: v.array(v.id("jobs")),
    boardId: v.optional(v.id("jobBoards")),
    finish: v.boolean(),
  },
  cursor: v.string(),
})

// One-off: counts every role, then rolls each board up from those counts, then switches Jobs over
// in the same mutation as the last step, so a reader sees the old numbers or exact ones and never
// half a fill. Writes keep what's filled right while it runs. Safe to run again. Run it right after
// deploying, on each deployment:
//   npx convex run api/migrations:fillJobCounts
//   npx convex run api/migrations:jobCountsLeft
// Delete it, and everything it leaves unused, once that's done everywhere.
export const fillJobCounts = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    await ping(ctx, components.batchWorker, {
      name: jobCountsWorker,
      workQuery: internal.api.migrations.nextJobCounts,
      workerMutation: internal.api.migrations.addJobCounts,
    })
    return null
  },
})

export const nextJobCounts = internalQuery({
  args: counting.vQueryArgs,
  returns: counting.vQueryReturns,
  handler: async (ctx, { cursor }) => {
    if ((await ctx.db.query("jobCatalog").first())?.countsReady) return { kind: "idle" as const }
    if (cursor !== "boards") {
      const page = await ctx.db.query("jobs").paginate({ numItems: 100, cursor: cursor ?? null })
      return {
        batch: { jobIds: page.page.map((j) => j._id), finish: false },
        cursor: page.isDone ? "boards" : page.continueCursor,
      }
    }
    const board = await ctx.db
      .query("jobBoards")
      .filter((q) => q.neq(q.field("counted"), true))
      .first()
    return { batch: { jobIds: [], boardId: board?._id, finish: !board }, cursor }
  },
})

export const addJobCounts = internalMutation({
  args: counting.vMutationArgs,
  returns: counting.vMutationReturns,
  handler: async (ctx, { jobIds, boardId, finish }) => {
    for (const jobId of jobIds) {
      const job = await ctx.db.get("jobs", jobId)
      if (job) await roleCounts.insertIfDoesNotExist(ctx, job)
    }
    if (boardId) await fillBoard(ctx, boardId)
    if (finish) await markCounted(ctx)
  },
})

// Boards not rolled up yet, and whether Jobs has switched over. Done at zero and true.
export const jobCountsLeft = internalQuery({
  args: {},
  returns: v.object({ boards: v.number(), ready: v.boolean() }),
  handler: async (ctx) => {
    let boards = 0
    for await (const board of ctx.db.query("jobBoards")) if (!board.counted) boards++
    const ready = (await ctx.db.query("jobCatalog").first())?.countsReady ?? false
    return { boards, ready }
  },
})
