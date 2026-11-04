import { getAuthUserId } from "@convex-dev/auth/server"
import { paginationResultValidator } from "convex/server"
import { ConvexError, type ObjectType, v } from "convex/values"
import type { Doc } from "../../_generated/dataModel"
import { query } from "../../_generated/server"
import { authedMutation, authedQuery, sessionMutation } from "../../lib/functions"
import { vVerdict } from "../workflows/validators"
import { fitOf, logNewApplication, nextNumber } from "../applications/utils"
import { priorityFor } from "../applications/validators"
import { leadOf } from "./leads"
import { previewOf } from "./links"
import { limits } from "../workflows/manager"
import { evidenceOf } from "./companies"
import { catalogCounts } from "./counts"
import { vCatalogSummary, vJobRow, vJobSearchArgs } from "./validators"
import { rowOf, searchJobs } from "./utils"

// The page size the app asks for. Signed out, nobody can ask for more.
const publicPage = 25

const wordsOf = (q: string | undefined) => q?.trim().slice(0, 200)

const asVisitor = (
  user: Doc<"users"> | null,
  { q, remoteOnly, boardId, since, paginationOpts }: ObjectType<typeof vJobSearchArgs>
) => {
  const words = wordsOf(q)
  return {
    q: words && words === user?.allowedSearch ? words : undefined,
    remoteOnly,
    boardId,
    since,
    paginationOpts: { ...paginationOpts, numItems: Math.min(paginationOpts.numItems, publicPage) },
  }
}

const search = query({
  args: vJobSearchArgs,
  returns: paginationResultValidator(vJobRow),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx)
    const user = userId && (await ctx.db.get("users", userId))
    const found =
      user && !user.anonymous
        ? await searchJobs(ctx, user._id, args)
        : await searchJobs(ctx, null, asVisitor(user || null, args))
    const evidence = await evidenceOf(ctx, found.page)
    const page = found.page.map(({ boardId: _, ...row }, i) => ({ ...row, evidence: evidence[i]! }))
    return { ...found, page }
  },
})

// Queries can't write, so an anonymous search is counted here and `search` only honors what this
// allowed. Running the same search again, or showing more of it, costs nothing.
const allowSearch = sessionMutation({
  args: { q: v.string() },
  returns: v.null(),
  handler: async (ctx, { q }) => {
    const user = await ctx.db.get("users", ctx.userId)
    const words = wordsOf(q)
    if (!user?.anonymous || !words || words === user.allowedSearch) return null
    const { ok } = await limits.limit(ctx, "anonymousSearch", { key: ctx.userId })
    if (!ok) throw new ConvexError("That's 10 searches today. Sign in to keep searching.")
    await ctx.db.patch("users", ctx.userId, { allowedSearch: words })
    return null
  },
})

// One role for its public page and link preview, so never anyone's verdict. Null once it's gone.
const posting = query({
  args: { id: v.string() },
  returns: v.union(vJobRow.extend({ text: v.string() }), v.null()),
  handler: async (ctx, { id }) => {
    const jobId = ctx.db.normalizeId("jobs", id)
    const job = jobId && (await ctx.db.get("jobs", jobId))
    if (!job) return null
    const { boardId: _, ...row } = rowOf(job, null)
    const [evidence] = await evidenceOf(ctx, [job])
    return { ...row, text: job.text, evidence: evidence! }
  },
})

const companies = query({
  args: {},
  returns: v.array(
    v.object({
      boardId: v.id("jobBoards"),
      company: v.string(),
      domain: v.union(v.string(), v.null()),
      jobs: v.number(),
    })
  ),
  handler: async (ctx) => {
    const boards = await ctx.db
      .query("jobBoards")
      .withIndex("by_jobs", (q) => q.gt("jobs", 0))
      .order("desc")
      .take(200)
    boards.sort((a, b) => b.jobs - a.jobs || a.company.localeCompare(b.company))
    const rows = []
    for (const b of boards) {
      const company = b.companyId ? await ctx.db.get("companies", b.companyId) : null
      rows.push({
        boardId: b._id,
        company: b.company,
        domain: company?.domain ?? null,
        jobs: b.jobs,
      })
    }
    return rows
  },
})

// Null until it's first counted.
const stats = query({
  args: {},
  returns: v.union(
    v.object({ boards: v.number(), jobs: v.number(), summary: vCatalogSummary }),
    v.null()
  ),
  handler: async (ctx) => {
    const row = await ctx.db.query("jobCatalog").first()
    return row && { boards: row.boards, ...(await catalogCounts(ctx)) }
  },
})

const sitemap = query({
  args: { cursor: v.union(v.string(), v.null()) },
  returns: v.object({
    page: v.array(
      v.object({ _id: v.id("jobs"), title: v.string(), company: v.string(), postedAt: v.number() })
    ),
    isDone: v.boolean(),
    continueCursor: v.string(),
  }),
  handler: async (ctx, { cursor }) => {
    const found = await ctx.db
      .query("jobs")
      .withIndex("by_postedAt")
      .order("desc")
      .paginate({ numItems: 1000, cursor, maximumBytesRead: 4_000_000 })
    return {
      page: found.page.map(({ _id, title, company, postedAt }) => ({
        _id,
        title,
        company,
        postedAt,
      })),
      isDone: found.isDone,
      continueCursor: found.continueCursor,
    }
  },
})

// How a role matches the person, once Jev has judged it for them: from a loop, a pasted link or
// checking it here. Null until then.
const match = authedQuery({
  args: { jobId: v.id("jobs") },
  returns: v.union(
    v.object({
      fit: v.number(),
      verdict: vVerdict,
      reasons: v.array(v.string()),
      applicationId: v.union(v.id("applications"), v.null()),
    }),
    v.null()
  ),
  handler: async (ctx, { jobId }) => {
    const job = await ctx.db.get("jobs", jobId)
    const lead = job && (await leadOf(ctx, ctx.userId, job))
    return (
      lead && {
        fit: lead.fit,
        verdict: lead.verdict,
        reasons: lead.reasons,
        applicationId: lead.applicationId ?? null,
      }
    )
  },
})

// A catalog role onto the person's board as Saved. The same role again opens what's there, back
// out of Archive or Trash, rather than adding it twice.
const track = authedMutation({
  args: { jobId: v.id("jobs") },
  returns: v.id("applications"),
  handler: async (ctx, { jobId }) => {
    const job = await ctx.db.get("jobs", jobId)
    if (!job) throw new ConvexError("That role has closed.")
    const lead = await leadOf(ctx, ctx.userId, job)
    const known =
      (lead?.applicationId && (await ctx.db.get("applications", lead.applicationId))) ||
      (await ctx.db
        .query("applications")
        .withIndex("by_userId_and_url", (q) => q.eq("userId", ctx.userId).eq("url", job.url))
        .first())
    if (known && known.userId === ctx.userId) {
      if (known.trashedAt !== undefined || known.archivedAt !== undefined)
        await ctx.db.patch("applications", known._id, {
          trashedAt: undefined,
          archivedAt: undefined,
          purgeAt: undefined,
        })
      return known._id
    }
    const applicationId = await ctx.db.insert("applications", {
      userId: ctx.userId,
      company: job.company,
      role: job.title,
      status: "saved",
      url: job.url,
      number: await nextNumber(ctx, ctx.userId),
      ...(job.location && { location: job.location }),
      labels: job.remote ? ["Remote"] : [],
      description: (job.summary ?? previewOf(job.text)).slice(0, 5000),
      method: "Company site",
      ...(lead && { priority: priorityFor(lead.fit), ...fitOf(lead) }),
      history: [{ status: "saved", at: Date.now() }],
    })
    await logNewApplication(ctx, ctx.userId, applicationId, job.company)
    if (lead) await ctx.db.patch("jobLeads", lead._id, { status: "applied", applicationId })
    return applicationId
  },
})

export const publicApi = { search, allowSearch, posting, stats, companies, sitemap, track, match }
