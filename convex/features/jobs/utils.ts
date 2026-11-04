import { stream } from "convex-helpers/server/stream"
import type { ObjectType } from "convex/values"
import { internal } from "../../_generated/api"
import type { Doc, Id } from "../../_generated/dataModel"
import type { MutationCtx, QueryCtx } from "../../_generated/server"
import schema from "../../schema"
import { catalogPool } from "../workflows/manager"
import { countriesOf, keyOf, placesOf, spacedLocation } from "./dimensions"
import { endingOf, proofOf } from "./domains"
import { previewOf } from "./links"
import type { vJobSearchArgs } from "./validators"

// Where a role is, for its pills: its cities, its countries and Remote, at most three.
export const placesOfJob = (location: string, remote: boolean) => {
  const spaced = spacedLocation(location)
  return [
    ...new Map(
      [...placesOf(spaced, remote), ...countriesOf(spaced)].map((p) => [keyOf(p), p])
    ).values(),
  ].slice(0, 3)
}

export const rowOf = (job: Doc<"jobs">, lead: Doc<"jobLeads"> | null) => ({
  _id: job._id,
  boardId: job.boardId,
  url: job.url,
  title: job.title,
  company: job.company,
  location: job.location,
  remote: job.remote,
  postedAt: job.postedAt,
  preview: previewOf(job.text),
  summary: job.summary ?? null,
  facts: job.facts ?? null,
  places: placesOfJob(job.location, job.remote),
  fit: lead?.fit ?? null,
  verdict: lead?.verdict ?? null,
})

// A role's proof and domain ending belong to its board, so they're read once per board.
const domainFilter = (
  ctx: QueryCtx,
  proof: ObjectType<typeof vJobSearchArgs>["proof"],
  ending: string | undefined
) => {
  const boards = new Map<Id<"jobBoards">, Promise<boolean>>()
  const check = async (boardId: Id<"jobBoards">) => {
    const board = await ctx.db.get("jobBoards", boardId)
    const company = board?.companyId ? await ctx.db.get("companies", board.companyId) : null
    return (
      (!proof || proofOf(company?.domain, board?.companyLink) === proof) &&
      (!ending || (company?.domain ? endingOf(company.domain) === ending : false))
    )
  }
  return (job: Doc<"jobs">) => {
    if (!proof && !ending) return Promise.resolve(true)
    const known = boards.get(job.boardId) ?? check(job.boardId)
    boards.set(job.boardId, known)
    return known
  }
}

// How far one page of a proof or ending filter looks, so a rare one stops short of the query's
// limits. Past it, the page comes back short and Show more carries on.
const domainFilterScan = 500

/** Without a `userId`, nobody's verdicts: no Fits me, and no verdict on a row. */
export const searchJobs = async (
  ctx: QueryCtx,
  userId: Id<"users"> | null,
  {
    q,
    remoteOnly,
    boardId,
    since,
    fits,
    proof,
    ending,
    paginationOpts,
  }: ObjectType<typeof vJobSearchArgs>
) => {
  const board = boardId ? ctx.db.normalizeId("jobBoards", boardId) : null
  if (boardId && !board) return { page: [], isDone: true, continueCursor: "" }
  const words = q?.trim().slice(0, 200)
  const keep = (job: Doc<"jobs">) =>
    (!remoteOnly || job.remote) &&
    (!board || job.boardId === board) &&
    (since === undefined || job.postedAt >= since)
  const onDomain = domainFilter(ctx, proof, ending)

  if (fits && userId) {
    const page = await ctx.db
      .query("jobLeads")
      .withIndex("by_userId_and_verdict_and_fit", (i) =>
        i.eq("userId", userId).eq("verdict", "fit")
      )
      .order("desc")
      .paginate(paginationOpts)
    const rows = []
    for (const lead of page.page) {
      const job = lead.jobId && (await ctx.db.get("jobs", lead.jobId))
      if (!job || !keep(job) || !(await onDomain(job))) continue
      const said = `${job.title} ${job.company} ${job.location}`.toLowerCase()
      if (
        words &&
        !words
          .toLowerCase()
          .split(/\s+/)
          .every((w) => said.includes(w))
      )
        continue
      rows.push(rowOf(job, lead))
    }
    return { ...page, page: rows }
  }

  const jobs = ctx.db.query("jobs")
  const all = stream(ctx.db, schema).query("jobs")
  const page = words
    ? await jobs
        .withSearchIndex("search_text", (s) => {
          const found = s.search("text", words)
          const remote = remoteOnly ? found.eq("remote", true) : found
          return board ? remote.eq("boardId", board) : remote
        })
        // After the search index, which only ranks Convex's top 1024 matches, so very
        // common words with "Posted" can miss recent roles that ranked lower.
        .filter((f) => (since === undefined ? true : f.gte(f.field("postedAt"), since)))
        .paginate(paginationOpts)
    : proof || ending
      ? await (
          board
            ? all.withIndex("by_boardId_and_postedAt", (i) =>
                since === undefined
                  ? i.eq("boardId", board)
                  : i.eq("boardId", board).gte("postedAt", since)
              )
            : all.withIndex("by_postedAt", (i) =>
                since === undefined ? i : i.gte("postedAt", since)
              )
        )
          .order("desc")
          .filterWith(async (job) => (!remoteOnly || job.remote) && (await onDomain(job)))
          .paginate({ ...paginationOpts, maximumRowsRead: domainFilterScan })
      : board
        ? await jobs
            .withIndex("by_boardId_and_postedAt", (i) =>
              since === undefined
                ? i.eq("boardId", board)
                : i.eq("boardId", board).gte("postedAt", since)
            )
            .order("desc")
            .filter((f) => (remoteOnly ? f.eq(f.field("remote"), true) : true))
            .paginate(paginationOpts)
        : remoteOnly
          ? await jobs
              .withIndex("by_remote_and_postedAt", (i) =>
                since === undefined
                  ? i.eq("remote", true)
                  : i.eq("remote", true).gte("postedAt", since)
              )
              .order("desc")
              .paginate(paginationOpts)
          : await jobs
              .withIndex("by_postedAt", (i) => (since === undefined ? i : i.gte("postedAt", since)))
              .order("desc")
              .paginate(paginationOpts)
  const rows = []
  for (const job of page.page) {
    // The search index can't see a role's board, so a search keeps what's on its page.
    if (words && !(await onDomain(job))) continue
    const lead =
      userId &&
      (await ctx.db
        .query("jobLeads")
        .withIndex("by_userId_and_urlKey", (i) => i.eq("userId", userId).eq("urlKey", job.urlKey))
        .first())
    rows.push(rowOf(job, lead ?? null))
  }
  return { ...page, page: rows }
}

export const refreshEvery = 20 * 60 * 60 * 1000

/** Queues a change to the catalog's number of boards, after a write to `jobBoards`, in the same
 * mutation. Read nothing here: looking at the row would collide with the queue writing it. */
export const countCatalog = (ctx: MutationCtx, change: { boards?: number }) =>
  catalogPool.enqueueMutation(ctx, internal.api.jobs.countBoards, change)
