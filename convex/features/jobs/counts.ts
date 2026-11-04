import { DirectAggregate, TableAggregate } from "@convex-dev/aggregate"
import { ShardedCounter } from "@convex-dev/sharded-counter"
import { components, internal } from "../../_generated/api"
import type { DataModel, Doc, Id } from "../../_generated/dataModel"
import type { MutationCtx, QueryCtx } from "../../_generated/server"
import { catalogPool } from "../workflows/manager"
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

// Each board's roles by remote and when posted, so the list can say how many match its filters.
// A tree per board, for the same reason as roleCounts.
export const timeCounts = new TableAggregate<{
  Namespace: Id<"jobBoards">
  Key: [boolean, number]
  DataModel: DataModel
  TableName: "jobs"
}>(components.jobTimeCounts, {
  namespace: (job) => job.boardId,
  sortKey: (job) => [job.remote, job.postedAt],
})

/** How many roles match these filters, exactly. */
export const matchingCount = async (
  ctx: QueryCtx,
  { remoteOnly, board, since }: { remoteOnly?: boolean; board?: Id<"jobBoards">; since?: number }
) => {
  const boards: Id<"jobBoards">[] = []
  if (board) boards.push(board)
  else for await (const namespace of timeCounts.iterNamespaces(ctx)) boards.push(namespace)
  const counts = await timeCounts.countBatch(
    ctx,
    boards.flatMap((namespace) =>
      (remoteOnly ? [true] : [false, true]).map((remote) => ({
        namespace,
        bounds:
          since === undefined
            ? { prefix: [remote] as [boolean] }
            : {
                lower: { key: [remote, since] as [boolean, number], inclusive: true },
                upper: {
                  key: [remote, Number.MAX_SAFE_INTEGER] as [boolean, number],
                  inclusive: true,
                },
              },
      }))
    )
  )
  return counts.reduce((sum, n) => sum + n, 0)
}

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

/** Only ever on catalogPool, so it's the one writer of these trees and totals. */
export const rollUp = async (
  ctx: MutationCtx,
  boardId: Id<"jobBoards">,
  was: Place,
  now: Place
) => {
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

// ponytail: a change is carried as before and after, so one that fails is lost from the totals
// until a backfill. Store what each board last rolled up if they ever drift.
/** After a write to `jobs`, or to where a board's roles are counted, in the same mutation: brings
 * the board's count to what its roles now say, and queues what's rolled up from it, so those totals
 * follow a moment later. */
export const recount = async (ctx: MutationCtx, boardId: Id<"jobBoards">, placed?: Place) => {
  const board = await ctx.db.get("jobBoards", boardId)
  if (!board) return
  const jobs = await roleCounts.count(ctx, { namespace: boardId })
  const was = placed ?? (await placeOf(ctx, board))
  const now = { ...(await placeOf(ctx, board)), jobs }
  if (jobs !== board.jobs) await ctx.db.patch("jobBoards", boardId, { jobs })
  if (was.proof !== now.proof || was.domain !== now.domain || was.jobs !== now.jobs)
    await catalogPool.enqueueMutation(ctx, internal.api.jobs.rollUpBoard, { boardId, was, now })
}

export const insertJob = async (
  ctx: MutationCtx,
  job: Omit<Doc<"jobs">, "_id" | "_creationTime">
) => {
  const id = await ctx.db.insert("jobs", job)
  const saved = (await ctx.db.get("jobs", id))!
  await roleCounts.insert(ctx, saved)
  await timeCounts.insert(ctx, saved)
}

export const deleteJob = async (ctx: MutationCtx, job: Doc<"jobs">) => {
  await ctx.db.delete("jobs", job._id)
  await roleCounts.deleteIfExists(ctx, job)
  await timeCounts.deleteIfExists(ctx, job)
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
