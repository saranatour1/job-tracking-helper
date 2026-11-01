import { v } from "convex/values"
import { internal } from "../../_generated/api"
import type { Id } from "../../_generated/dataModel"
import { internalMutation, internalQuery } from "../../_generated/server"
import { switchAt } from "../loops/catalog"
import { addUsage, usageOf } from "../loops/usage"
import { roleKey, urlKey } from "../workflows/fit"
import { readPool } from "../workflows/manager"
import { apiKeyOf, monthlyCredits, monthOf } from "../workflows/sources"
import { boardKinds, companyOf, isCompanyBoard, searchSlug, starterBoards } from "./boards"
import { researchBatch, researchEvery } from "./companies"
import { deleteJob, insertJob, placeOf, recount, roleCounts } from "./counts"
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

// ponytail: a search nobody runs anymore keeps refreshing, and shares the 25 boards an hour
// with everything else. Add a last-used date if that crowds out company boards.
const addSearches = internalMutation({
  args: { searches: v.array(v.object({ what: v.string(), where: v.string() })) },
  returns: v.array(v.id("jobBoards")),
  handler: async (ctx, { searches }) => {
    const added: Id<"jobBoards">[] = []
    for (const { what, where } of searches.slice(0, 8)) {
      const slug = searchSlug(what, where)
      const known = await ctx.db
        .query("jobBoards")
        .withIndex("by_kind_and_slug", (q) => q.eq("kind", "arbeitsagentur").eq("slug", slug))
        .first()
      if (known) continue
      added.push(
        await ctx.db.insert("jobBoards", {
          kind: "arbeitsagentur",
          slug,
          company: `Arbeitsagentur: ${what.trim().slice(0, 80)}, ${where.trim().slice(0, 80)}`,
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
  args: { boardId: v.id("jobBoards"), jobs: v.array(vFeedJob) },
  returns: v.null(),
  handler: async (ctx, { boardId, jobs }) => {
    let added = false
    for (const job of jobs) {
      const key = urlKey(job.url)
      const known = await ctx.db
        .query("jobs")
        .withIndex("by_urlKey", (q) => q.eq("urlKey", key))
        .first()
      if (!known) {
        await insertJob(ctx, { ...job, boardId, urlKey: key })
        added = true
      }
      // A write reindexes the role's text and reruns every open search that read it, so a
      // role the feed didn't change stays as it is.
      else if ((Object.keys(job) as (keyof typeof job)[]).some((k) => job[k] !== known[k])) {
        await ctx.db.patch("jobs", known._id, job)
        if (job.company !== known.company)
          await roleCounts.replaceOrInsert(ctx, known, { ...known, ...job })
      }
    }
    if (added) await recount(ctx, boardId)
    return null
  },
})

const boardPostings = internalQuery({
  args: { boardId: v.id("jobBoards"), cursor: v.union(v.string(), v.null()) },
  returns: v.object({
    page: v.array(v.object({ _id: v.id("jobs"), urlKey: v.string() })),
    isDone: v.boolean(),
    continueCursor: v.string(),
  }),
  handler: async (ctx, { boardId, cursor }) => {
    const { page, isDone, continueCursor } = await ctx.db
      .query("jobs")
      .withIndex("by_boardId_and_postedAt", (q) => q.eq("boardId", boardId))
      .paginate({ numItems: 200, cursor })
    return { page: page.map((j) => ({ _id: j._id, urlKey: j.urlKey })), isDone, continueCursor }
  },
})

const closeJobs = internalMutation({
  args: { jobIds: v.array(v.id("jobs")) },
  returns: v.null(),
  handler: async (ctx, { jobIds }) => {
    const boards = new Set<Id<"jobBoards">>()
    for (const jobId of jobIds) {
      const job = await ctx.db.get("jobs", jobId)
      if (!job) continue
      await deleteJob(ctx, job)
      boards.add(job.boardId)
    }
    for (const boardId of boards) await recount(ctx, boardId)
    return null
  },
})

const boardFetched = internalMutation({
  args: vBoardFetchedArgs,
  returns: v.null(),
  handler: async (ctx, { boardId, jobs, error, company }) => {
    const b = await ctx.db.get("jobBoards", boardId)
    // A search with no roles, often a place outside Germany, isn't worth refreshing. The next
    // run asks again.
    if (b?.kind === "arbeitsagentur" && !error && !jobs && !b.jobs) {
      await ctx.db.delete("jobBoards", boardId)
      await countCatalog(ctx, { boards: -1 })
      return null
    }
    // A board's `jobs` follows its rows. A feed can list one role twice, or one saved from another
    // board, so the feed's length isn't how many roles it has here.
    if (b)
      await ctx.db.patch("jobBoards", boardId, {
        fetchedAt: Date.now(),
        error,
        ...(company?.trim() && { company: company.trim().slice(0, 120) }),
      })
    return null
  },
})

// ponytail: a run gives up after reading 600 roles, which keeps full role texts under Convex's
// 16 MB a query. Carry a cursor between runs if people run out of new roles that deep.
const maxScanned = 600

const candidates = internalQuery({
  args: vCandidatesArgs,
  returns: v.array(v.id("jobs")),
  handler: async (ctx, { userId, queries, remoteOnly, companies, since, limit }) => {
    // Read one role at a time, taking turns, so a run reads only as far down each search as it
    // needs. The top matches stop being new once earlier runs have judged them.
    const searches = queries.map((query) =>
      ctx.db
        .query("jobs")
        .withSearchIndex("search_text", (q) =>
          remoteOnly ? q.search("text", query).eq("remote", true) : q.search("text", query)
        )
        [Symbol.asyncIterator]()
    )
    const wanted = companies.map((c) => c.toLowerCase())
    const picked: Id<"jobs">[] = []
    const seen = new Set<string>()
    const read = new Set<Id<"jobs">>()
    let open = searches
    let scanned = 0
    while (picked.length < limit && open.length && scanned < maxScanned) {
      const turn = await Promise.all(open.map((s) => s.next()))
      open = open.filter((_, i) => !turn[i]!.done)
      scanned += open.length
      for (const result of turn) {
        if (result.done || picked.length >= limit) continue
        const job = result.value
        if (read.has(job._id)) continue
        read.add(job._id)
        const role = roleKey(job)
        if (seen.has(role)) continue
        if (since && job.postedAt < since) continue
        const company = job.company.toLowerCase()
        if (wanted.length && !wanted.some((c) => company.includes(c) || c.includes(company)))
          continue
        // ponytail: a role reposted under the same title stays skipped for good, even a year
        // later. Compare the lead's age here if people miss real reopenings.
        if (await leadOf(ctx, userId, job)) continue
        // Only once picked: another posting of this role can pass where this one didn't.
        seen.add(role)
        picked.push(job._id)
      }
    }
    for (const search of open) await search.return?.()
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
// nothing shows its company, and a search would cost credits. A board of many companies has no
// one site to find, so its roles stay unverified.
// ponytail: those are read again every run. Stamp them if saved searches reach the thousands.
const researchDue = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const boardIds: Id<"jobBoards">[] = []
    const due = ctx.db
      .query("jobBoards")
      .withIndex("by_researchedAt", (q) => q.lt("researchedAt", Date.now() - researchEvery))
    for await (const b of due) {
      if (b.jobs && isCompanyBoard(b.kind)) boardIds.push(b._id)
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
    const was = await placeOf(ctx, board)
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
    await recount(ctx, boardId, was)
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
  addSearches,
  ensureBoard,
  hasBoard,
  saveJobs,
  boardPostings,
  closeJobs,
  boardFetched,
  researchDue,
  researchInputs,
  saveResearch,
  candidates,
  byUrlKey,
  get,
}
