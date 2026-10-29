import { v } from "convex/values"
import { internal } from "../../../_generated/api"
import type { Id } from "../../../_generated/dataModel"
import { internalMutation, internalQuery } from "../../../_generated/server"
import { urlKey } from "../workflows/fit"
import { readPool } from "../workflows/manager"
import { boardKinds, boardOf, companyOf, starterBoards } from "./boards"
import { vFeedJob } from "./validators"

// Boards are fetched about once a day; the hourly cron queues those due.
const refreshEvery = 20 * 60 * 60 * 1000

// The cron's job, every hour: start the catalog from the starter boards the first time,
// then hand the boards that are due to the batch worker.
const refreshDue = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const now = Date.now()
    if (!(await ctx.db.query("jobBoards").first()))
      for (const b of starterBoards)
        await ctx.db.insert("jobBoards", {
          ...b,
          company: companyOf(b.slug),
          addedAt: now,
          jobs: 0,
        })
    const due = await ctx.db
      .query("jobBoards")
      .withIndex("by_fetchedAt", (q) => q.lt("fetchedAt", now - refreshEvery))
      .take(25)
    if (!due.length) return 0
    await readPool.enqueueActionBatch(
      ctx,
      internal.jobs.fetchBoard,
      due.map((b) => ({ boardId: b._id }))
    )
    // Marked now, so the next tick doesn't queue them again while they're fetching.
    for (const b of due) await ctx.db.patch("jobBoards", b._id, { fetchedAt: now })
    return due.length
  },
})

const board = internalQuery({
  args: { boardId: v.id("jobBoards") },
  handler: (ctx, { boardId }) => ctx.db.get("jobBoards", boardId),
})

// Adds the boards behind a search's postings. Returns the new ones, up to 10, so the
// run can fetch them before it picks jobs.
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
    return added
  },
})

// Saves part of one board's fetch: new roles are added, listed ones get a fresh `seenAt`.
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

// Finishes a fetch: drops the roles the board no longer lists and records how it went.
// ponytail: removes up to 500 closed roles a fetch; the rest go on the next day's.
const boardFetched = internalMutation({
  args: {
    boardId: v.id("jobBoards"),
    startedAt: v.number(),
    jobs: v.number(),
    error: v.optional(v.string()),
    // The name the board's own roles give the company, which reads better than one
    // made from the board's address.
    company: v.optional(v.string()),
  },
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
    return null
  },
})

// The roles a run sends to Jev: matches for each of the loop's searches, taken in turn,
// that the person hasn't been shown and that pass the loop's hard rules.
const candidates = internalQuery({
  args: {
    userId: v.id("users"),
    queries: v.array(v.string()),
    remoteOnly: v.boolean(),
    companies: v.array(v.string()),
    since: v.optional(v.number()),
    limit: v.number(),
  },
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

// The board behind a pasted link, added if the catalog doesn't have it yet.
const ensureBoard = internalMutation({
  args: { kind: v.union(...boardKinds.map((k) => v.literal(k))), slug: v.string() },
  returns: v.id("jobBoards"),
  handler: async (ctx, b) => {
    const known = await ctx.db
      .query("jobBoards")
      .withIndex("by_kind_and_slug", (q) => q.eq("kind", b.kind).eq("slug", b.slug))
      .first()
    return (
      known?._id ??
      ctx.db.insert("jobBoards", { ...b, company: companyOf(b.slug), addedAt: Date.now(), jobs: 0 })
    )
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
