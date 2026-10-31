import { v } from "convex/values"
import { internal } from "../../_generated/api"
import type { Id } from "../../_generated/dataModel"
import { internalMutation, internalQuery } from "../../_generated/server"
import { urlKey } from "../workflows/fit"
import { readPool } from "../workflows/manager"
import { boardKinds, boardOf, companyOf, starterBoards } from "./boards"
import { vFeedJob, vBoardFetchedArgs, vCandidatesArgs } from "./validators"
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
        if (picked.length >= limit || seen.has(job._id)) continue
        seen.add(job._id)
        if (since && job.postedAt < since) continue
        const company = job.company.toLowerCase()
        if (wanted.length && !wanted.some((c) => company.includes(c) || c.includes(company)))
          continue
        const shown = await ctx.db
          .query("jobLeads")
          .withIndex("by_userId_and_urlKey", (q) => q.eq("userId", userId).eq("urlKey", job.urlKey))
          .first()
        if (!shown) picked.push(job._id)
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

const get = internalQuery({
  args: { jobId: v.id("jobs") },
  handler: (ctx, { jobId }) => ctx.db.get("jobs", jobId),
})

export const internalApi = {
  refreshDue,
  board,
  addBoards,
  ensureBoard,
  saveJobs,
  boardFetched,
  candidates,
  byUrlKey,
  get,
}
