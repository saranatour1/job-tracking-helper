import { v } from "convex/values"
import { internal } from "../../_generated/api"
import type { Id } from "../../_generated/dataModel"
import { internalMutation, internalQuery } from "../../_generated/server"
import { switchAt } from "../loops/catalog"
import { addUsage, usageOf } from "../loops/usage"
import { roleKey, urlKey } from "../workflows/fit"
import { readPool } from "../workflows/manager"
import { apiKeyOf, monthlyCredits, monthOf } from "../workflows/sources"
import { boardKinds, companyOf, starterBoards } from "./boards"
import { researchBatch, researchEvery } from "./companies"
import { leadOf } from "./leads"
import { boardOf } from "./links"
import { vFeedJob, vBoardFetchedArgs, vCandidatesArgs, vSaveResearchArgs } from "./validators"
import { countCatalog, refreshEvery } from "./utils"

const refreshDue = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const now = Date.now()
    if (!(await ctx.db.query("jobBoards").first())) {
      for (const b of starterBoards)
        await ctx.db.insert("jobBoards", {
          ...b,
          company: companyOf(b.slug),
          addedAt: now,
          jobs: 0,
        })
      await countCatalog(ctx, { boards: starterBoards.length })
    }
    const due = await ctx.db
      .query("jobBoards")
      .withIndex("by_fetchedAt", (q) => q.lt("fetchedAt", now - refreshEvery))
      .take(25)
    if (!due.length) return 0
    await readPool.enqueueActionBatch(
      ctx,
      internal.api.jobs.fetchBoard,
      due.map((b) => ({ boardId: b._id }))
    )
    for (const b of due) await ctx.db.patch("jobBoards", b._id, { fetchedAt: now })
    return due.length
  },
})

const board = internalQuery({
  args: { boardId: v.id("jobBoards") },
  handler: (ctx, { boardId }) => ctx.db.get("jobBoards", boardId),
})

const addBoards = internalMutation({
  args: { urls: v.array(v.string()) },
  returns: v.array(v.id("jobBoards")),
  handler: async (ctx, { urls }) => {
    const added: Id<"jobBoards">[] = []
    const seen = new Set<string>()
    for (const url of urls) {
      const b = boardOf(url)
      if (!b || seen.has(`${b.kind}/${b.slug}`) || added.length >= 10) continue
      seen.add(`${b.kind}/${b.slug}`)
      const known = await ctx.db
        .query("jobBoards")
        .withIndex("by_kind_and_slug", (q) => q.eq("kind", b.kind).eq("slug", b.slug))
        .first()
      if (!known)
        added.push(
          await ctx.db.insert("jobBoards", {
            ...b,
            company: companyOf(b.slug),
            addedAt: Date.now(),
            jobs: 0,
          })
        )
    }
    if (added.length) await countCatalog(ctx, { boards: added.length })
    return added
  },
})

const saveJobs = internalMutation({
  args: { boardId: v.id("jobBoards"), jobs: v.array(vFeedJob), seenAt: v.number() },
  returns: v.null(),
  handler: async (ctx, { boardId, jobs, seenAt }) => {
    for (const job of jobs) {
      const key = urlKey(job.url)
      const known = await ctx.db
        .query("jobs")
        .withIndex("by_urlKey", (q) => q.eq("urlKey", key))
        .first()
      if (known) await ctx.db.patch("jobs", known._id, { ...job, seenAt })
      else await ctx.db.insert("jobs", { ...job, boardId, urlKey: key, seenAt })
    }
    return null
  },
})

// ponytail: removes up to 500 closed roles a fetch; the rest go on the next day's.
const boardFetched = internalMutation({
  args: vBoardFetchedArgs,
  returns: v.null(),
  handler: async (ctx, { boardId, startedAt, jobs, error, company }) => {
    if (!error) {
      const closed = await ctx.db
        .query("jobs")
        .withIndex("by_boardId_and_seenAt", (q) => q.eq("boardId", boardId).lt("seenAt", startedAt))
        .take(500)
      for (const job of closed) await ctx.db.delete("jobs", job._id)
    }
    const b = await ctx.db.get("jobBoards", boardId)
    if (b)
      await ctx.db.patch("jobBoards", boardId, {
        fetchedAt: Date.now(),
        jobs: error ? b.jobs : jobs,
        error,
        ...(company?.trim() && { company: company.trim().slice(0, 120) }),
      })
    if (b && !error && jobs !== b.jobs) await countCatalog(ctx, { jobs: jobs - b.jobs })
    return null
  },
})

const candidates = internalQuery({
  args: vCandidatesArgs,
  returns: v.array(v.id("jobs")),
  handler: async (ctx, { userId, queries, remoteOnly, companies, since, limit }) => {
    const results = await Promise.all(
      queries.map((query) =>
        ctx.db
          .query("jobs")
          .withSearchIndex("search_text", (q) =>
            remoteOnly ? q.search("text", query).eq("remote", true) : q.search("text", query)
          )
          .take(limit)
      )
    )
    const wanted = companies.map((c) => c.toLowerCase())
    const picked: Id<"jobs">[] = []
    const seen = new Set<string>()
    for (let i = 0; picked.length < limit && results.some((r) => i < r.length); i++)
      for (const job of results.map((r) => r[i]).filter(Boolean)) {
        const role = roleKey(job)
        if (picked.length >= limit || seen.has(role)) continue
        seen.add(role)
        if (since && job.postedAt < since) continue
        const company = job.company.toLowerCase()
        if (wanted.length && !wanted.some((c) => company.includes(c) || c.includes(company)))
          continue
        // ponytail: a role reposted under the same title stays skipped for good, even a year
        // later. Compare the lead's age here if people miss real reopenings.
        if (!(await leadOf(ctx, userId, job))) picked.push(job._id)
      }
    return picked
  },
})

const byUrlKey = internalQuery({
  args: { urlKey: v.string() },
  handler: (ctx, { urlKey }) =>
    ctx.db
      .query("jobs")
      .withIndex("by_urlKey", (q) => q.eq("urlKey", urlKey))
      .first(),
})

const hasBoard = internalQuery({
  args: { kind: v.union(...boardKinds.map((k) => v.literal(k))), slug: v.string() },
  returns: v.boolean(),
  handler: async (ctx, b) =>
    (await ctx.db
      .query("jobBoards")
      .withIndex("by_kind_and_slug", (q) => q.eq("kind", b.kind).eq("slug", b.slug))
      .first()) !== null,
})

const ensureBoard = internalMutation({
  args: { kind: v.union(...boardKinds.map((k) => v.literal(k))), slug: v.string() },
  returns: v.id("jobBoards"),
  handler: async (ctx, b) => {
    const known = await ctx.db
      .query("jobBoards")
      .withIndex("by_kind_and_slug", (q) => q.eq("kind", b.kind).eq("slug", b.slug))
      .first()
    if (known) return known._id
    const id = await ctx.db.insert("jobBoards", {
      ...b,
      company: companyOf(b.slug),
      addedAt: Date.now(),
      jobs: 0,
    })
    await countCatalog(ctx, { boards: 1 })
    return id
  },
})

// Boards never researched, then ones not researched in a month. A board with no roles waits:
// nothing shows its company, and a search would cost credits.
const researchDue = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const boardIds: Id<"jobBoards">[] = []
    const due = ctx.db
      .query("jobBoards")
      .withIndex("by_researchedAt", (q) => q.lt("researchedAt", Date.now() - researchEvery))
    for await (const b of due) {
      if (b.jobs) boardIds.push(b._id)
      if (boardIds.length === researchBatch) break
    }
    if (boardIds.length)
      await readPool.enqueueAction(ctx, internal.api.jobs.researchBoards, { boardIds }, {})
    return boardIds.length
  },
})

const researchInputs = internalQuery({
  args: { boardIds: v.array(v.id("jobBoards")) },
  handler: async (ctx, { boardIds }) => {
    const usage = await usageOf(ctx, "firecrawl", monthOf(Date.now()))
    const boards = []
    for (const boardId of boardIds) {
      const board = await ctx.db.get("jobBoards", boardId)
      if (!board) continue
      const jobs = await ctx.db
        .query("jobs")
        .withIndex("by_boardId_and_postedAt", (q) => q.eq("boardId", boardId))
        .order("desc")
        .take(20)
      const company = board.companyId ? await ctx.db.get("companies", board.companyId) : null
      boards.push({
        boardId,
        company: board.company,
        link: board.companyLink ?? null,
        domain: company?.domain ?? null,
        urls: jobs.map((j) => j.url),
      })
    }
    return {
      boards,
      canSearch:
        Boolean(apiKeyOf("firecrawl")) &&
        !usage?.exhaustedAt &&
        (usage?.used ?? 0) < monthlyCredits("firecrawl") * switchAt,
    }
  },
})

// One row per domain, however many boards reach it. A board with no site found has a row of its
// own, since a name alone can't say two boards are one company.
const saveResearch = internalMutation({
  args: vSaveResearchArgs,
  returns: v.null(),
  handler: async (ctx, { boardId, domain, link, yc, registeredAt, credits, exhausted }) => {
    if (credits || exhausted) await addUsage(ctx, "firecrawl", credits, exhausted)
    const board = await ctx.db.get("jobBoards", boardId)
    if (!board) return null
    const before = board.companyId ? await ctx.db.get("companies", board.companyId) : null
    const known = domain
      ? await ctx.db
          .query("companies")
          .withIndex("by_domain", (q) => q.eq("domain", domain))
          .first()
      : before && !before.domain
        ? before
        : null
    let companyId = known?._id
    if (known) {
      // A registry that didn't answer this time doesn't make the domain any younger.
      if (domain)
        await ctx.db.patch("companies", known._id, {
          yc,
          registeredAt: registeredAt ?? known.registeredAt,
        })
    } else
      companyId = await ctx.db.insert("companies", {
        name: board.company,
        ...(domain && { domain, yc, registeredAt }),
      })
    await ctx.db.patch("jobBoards", boardId, {
      companyId,
      companyLink: link,
      researchedAt: Date.now(),
    })
    if (before && before._id !== companyId) {
      const shared = await ctx.db
        .query("jobBoards")
        .withIndex("by_companyId", (q) => q.eq("companyId", before._id))
        .first()
      if (!shared) await ctx.db.delete("companies", before._id)
    }
    return null
  },
})

const get = internalQuery({
  args: { jobId: v.id("jobs") },
  handler: (ctx, { jobId }) => ctx.db.get("jobs", jobId),
})

export const internalApi = {
  refreshDue,
  board,
  addBoards,
  ensureBoard,
  hasBoard,
  saveJobs,
  boardFetched,
  researchDue,
  researchInputs,
  saveResearch,
  candidates,
  byUrlKey,
  get,
}
