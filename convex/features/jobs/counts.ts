import { DirectAggregate, TableAggregate } from "@convex-dev/aggregate"
import { ShardedCounter } from "@convex-dev/sharded-counter"
import { components } from "../../_generated/api"
import type { DataModel, Doc, Id } from "../../_generated/dataModel"
import type { MutationCtx, QueryCtx } from "../../_generated/server"
import { isCompanyBoard } from "./boards"
import { endingOf, type Proof, proofOf, proofs } from "./domains"

// Each board's roles, by company. A tree per board, so boards refreshing at once don't collide.
export const roleCounts = new TableAggregate<{
  Namespace: Id<"jobBoards">
  Key: string
  DataModel: DataModel
  TableName: "jobs"
}>(components.jobRoleCounts, {
  namespace: (job) => job.boardId,
  sortKey: (job) => job.company,
})

// One item per board with roles and a site, worth its roles, so a domain's count is a sum and a
// board moving to another company moves one item, not all its roles. A tree per domain ending.
const domainCounts = new DirectAggregate<{
  Namespace: string
  Key: [string, Id<"jobBoards">]
  Id: Id<"jobBoards">
}>(components.jobDomainCounts)

// Every refreshing board writes these. `count` reads all the shards, so it's exact. A role has one
// proof, so together they're the total.
const totals = new ShardedCounter<"domains" | Proof>(components.shardedCounter, {
  defaultShards: 8,
})

const add = async (ctx: MutationCtx, total: "domains" | Proof, by: number) => {
  if (by) await totals.add(ctx, total, by)
}

type Place = { proof: Proof; domain: string | null; jobs: number }

/** Where a board's roles are counted now. */
export const placeOf = async (ctx: QueryCtx, board: Doc<"jobBoards">): Promise<Place> => {
  const company = board.companyId ? await ctx.db.get("companies", board.companyId) : null
  return {
    proof: proofOf(company?.domain, board.companyLink),
    domain: company?.domain ?? null,
    jobs: board.jobs,
  }
}

const domainTotal = (ctx: QueryCtx, domain: string) =>
  domainCounts.sum(ctx, { namespace: endingOf(domain), bounds: { prefix: [domain] } })

const rollUp = async (ctx: MutationCtx, boardId: Id<"jobBoards">, was: Place, now: Place) => {
  const domains = [...new Set([was.domain, now.domain])].filter((d) => d !== null)
  const before = await Promise.all(domains.map((d) => domainTotal(ctx, d)))
  if (was.domain)
    await domainCounts.deleteIfExists(ctx, {
      namespace: endingOf(was.domain),
      key: [was.domain, boardId],
      id: boardId,
    })
  if (now.domain && now.jobs)
    await domainCounts.insert(ctx, {
      namespace: endingOf(now.domain),
      key: [now.domain, boardId],
      id: boardId,
      sumValue: now.jobs,
    })
  const after = await Promise.all(domains.map((d) => domainTotal(ctx, d)))
  for (const [i, total] of after.entries())
    await add(ctx, "domains", Number(total > 0) - Number(before[i]! > 0))
  await add(ctx, was.proof, -was.jobs)
  await add(ctx, now.proof, now.jobs)
}

/** After a write to `jobs`, or to where a board's roles are counted, in the same mutation: brings
 * the board's count and all that's rolled up from it to what its roles now say. A board the fill
 * hasn't reached waits for it. */
export const recount = async (ctx: MutationCtx, boardId: Id<"jobBoards">, placed?: Place) => {
  const board = await ctx.db.get("jobBoards", boardId)
  if (!board?.counted) return
  const jobs = await roleCounts.count(ctx, { namespace: boardId })
  const was = placed ?? (await placeOf(ctx, board))
  const now = { ...(await placeOf(ctx, board)), jobs }
  if (jobs !== board.jobs) await ctx.db.patch("jobBoards", boardId, { jobs })
  if (was.proof !== now.proof || was.domain !== now.domain || was.jobs !== now.jobs)
    await rollUp(ctx, boardId, was, now)
}

export const insertJob = async (
  ctx: MutationCtx,
  job: Omit<Doc<"jobs">, "_id" | "_creationTime">
) => {
  const id = await ctx.db.insert("jobs", job)
  // If-does-not-exist so the fill and a write can reach a new role in either order.
  await roleCounts.insertIfDoesNotExist(ctx, (await ctx.db.get("jobs", id))!)
}

export const deleteJob = async (ctx: MutationCtx, job: Doc<"jobs">) => {
  await ctx.db.delete("jobs", job._id)
  await roleCounts.deleteIfExists(ctx, job)
}

/** The fill's last step for a board, once every role is in `roleCounts`. */
export const fillBoard = async (ctx: MutationCtx, boardId: Id<"jobBoards">) => {
  const board = await ctx.db.get("jobBoards", boardId)
  if (!board || board.counted) return
  const jobs = await roleCounts.count(ctx, { namespace: boardId })
  const place = await placeOf(ctx, board)
  await ctx.db.patch("jobBoards", boardId, { jobs, counted: true })
  await rollUp(ctx, boardId, { ...place, domain: null, jobs: 0 }, { ...place, jobs })
}

export const markCounted = async (ctx: MutationCtx) => {
  const row = await ctx.db.query("jobCatalog").first()
  if (row) await ctx.db.patch("jobCatalog", row._id, { countsReady: true })
}

export const catalogCounts = async (ctx: QueryCtx) => {
  const [domains, own, name, unverified] = await Promise.all(
    (["domains", ...proofs] as const).map((total) => totals.count(ctx, total))
  )
  const namespaces: string[] = []
  for await (const ending of domainCounts.iterNamespaces(ctx)) namespaces.push(ending)
  const sums = await domainCounts.sumBatch(
    ctx,
    namespaces.map((namespace) => ({ namespace }))
  )
  return {
    jobs: own! + name! + unverified!,
    summary: {
      domains: domains!,
      own: own!,
      name: name!,
      unverified: unverified!,
      endings: namespaces
        .map((ending, i) => ({ ending, jobs: sums[i]! }))
        .filter((e) => e.jobs > 0)
        .sort((a, b) => b.jobs - a.jobs || a.ending.localeCompare(b.ending)),
    },
  }
}

/** How many roles each domain row shows: all of the domain's, or all of its board's, or for a board
 * of many companies, that company's. */
export const openRoles = async (
  ctx: QueryCtx,
  rows: { board: Doc<"jobBoards"> | null; domain: string | undefined; company: string }[]
) => {
  const domains = [...new Set(rows.flatMap((r) => (r.domain ? [r.domain] : [])))]
  const pooledKey = (boardId: Id<"jobBoards">, company: string) => `${boardId}/${company}`
  const pooled = new Map(
    rows.flatMap(({ board, domain, company }) =>
      board && !domain && !isCompanyBoard(board.kind)
        ? [[pooledKey(board._id, company), { namespace: board._id, company }] as const]
        : []
    )
  )
  const [sums, counts] = await Promise.all([
    domains.length
      ? domainCounts.sumBatch(
          ctx,
          domains.map((domain) => ({
            namespace: endingOf(domain),
            bounds: { prefix: [domain] as [string] },
          }))
        )
      : [],
    pooled.size
      ? roleCounts.countBatch(
          ctx,
          [...pooled.values()].map(({ namespace, company }) => {
            const at = { key: company, inclusive: true }
            return { namespace, bounds: { lower: at, upper: at } }
          })
        )
      : [],
  ])
  const ofDomain = new Map(domains.map((domain, i) => [domain, sums[i]!]))
  const ofPooled = new Map([...pooled.keys()].map((key, i) => [key, counts[i]!]))
  return rows.map(({ board, domain, company }) => {
    if (!board) return null
    if (domain) return ofDomain.get(domain)!
    return ofPooled.get(pooledKey(board._id, company)) ?? board.jobs
  })
}
