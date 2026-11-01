import { v } from "convex/values"
import { internal } from "../_generated/api"
import type { Id } from "../_generated/dataModel"
import { internalMutation, internalQuery } from "../_generated/server"
import { fitOf } from "../features/applications/utils"
import { syncMailSummary } from "../features/email/utils"
import { companyOf, nonTechStarters, techFeeds } from "../features/jobs/boards"
import { isCompanyBoard } from "../features/jobs/boards"
import { deleteJob, recount } from "../features/jobs/counts"
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
      const boards = new Set<Id<"jobBoards">>()
      for (const job of page.page) {
        const key = urlKey(job.url)
        if (key === job.urlKey) continue
        // A refresh got there first and saved it under the new key. Leads move over below.
        if (await jobByKey(key)) {
          await deleteJob(ctx, job)
          boards.add(job.boardId)
        } else await ctx.db.patch("jobs", job._id, { urlKey: key })
      }
      for (const boardId of boards) await recount(ctx, boardId)
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
      })
      added++
    }
    if (added) await countCatalog(ctx, { boards: added })
    return added
  },
})

// One-off: takes what Jobs no longer reads off stored rows, so a later deploy can drop those fields
// from the schema. Safe to run again. Run it on each deployment, then delete it with the fields:
//   npx convex run api/migrations:clearOldCounts
export const clearOldCounts = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    for await (const board of ctx.db.query("jobBoards"))
      if (board.counted !== undefined)
        await ctx.db.patch("jobBoards", board._id, { counted: undefined })
    const row = await ctx.db.query("jobCatalog").first()
    if (row)
      await ctx.db.patch("jobCatalog", row._id, {
        jobs: undefined,
        summary: undefined,
        countsReady: undefined,
      })
    return null
  },
})
