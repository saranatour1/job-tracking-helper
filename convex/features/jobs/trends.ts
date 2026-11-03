import { defineBatchWorkerValidators, ping } from "@convex-dev/batch-worker"
import { v } from "convex/values"
import { components, internal } from "../../_generated/api"
import type { Doc, Id } from "../../_generated/dataModel"
import { internalMutation, internalQuery, query, type QueryCtx } from "../../_generated/server"
import {
  countriesOf,
  type Dimension,
  keyOf,
  placesOf,
  titleOf,
  weekMs,
  weekOf,
  weeksShown,
} from "./dimensions"
import { vDimension } from "./validators"

const worker = "jobTrends"
const batchSize = 200
const shown = 20

// A role's `_creationTime` is when its mutation started, so one still saving can land behind one
// already read. Mutations last seconds, so nothing this old is still on its way.
const settledMs = 60 * 1000

const { vQueryArgs, vQueryReturns, vMutationArgs, vMutationReturns } = defineBatchWorkerValidators({
  batch: {
    counts: v.array(
      v.object({
        dimension: vDimension,
        key: v.string(),
        label: v.string(),
        week: v.number(),
        roles: v.number(),
      })
    ),
  },
  cursor: v.number(),
})

const tally = (
  jobs: Doc<"jobs">[],
  fallbackOf: (boardId: Id<"jobBoards">) => string | undefined
) => {
  const counts = new Map<
    string,
    { dimension: Dimension; key: string; label: string; week: number; roles: number }
  >()
  const add = (dimension: Dimension, label: string, week: number) => {
    const key = keyOf(label)
    const at = `${dimension}/${week}/${key}`
    const count = counts.get(at) ?? { dimension, key, label, week, roles: 0 }
    counts.set(at, { ...count, roles: count.roles + 1 })
  }
  for (const job of jobs) {
    const week = weekOf(job.postedAt)
    for (const c of countriesOf(job.location, fallbackOf(job.boardId))) add("country", c, week)
    for (const p of placesOf(job.location, job.remote)) add("place", p, week)
    const title = titleOf(job.title)
    if (title) add("title", title, week)
  }
  return [...counts.values()]
}

// Arbeitsagentur lists only German towns, and only by name.
const germanBoards = async (ctx: QueryCtx, jobs: Doc<"jobs">[]) => {
  const ids = [...new Set(jobs.map((j) => j.boardId))]
  const boards = await Promise.all(ids.map((id) => ctx.db.get("jobBoards", id)))
  return new Set(boards.flatMap((b) => (b?.kind === "arbeitsagentur" ? [b._id] : [])))
}

// Reads the roles here and not in the mutation, where their text would count against it and new
// roles would conflict with it. Starting with no cursor, the first run counts every open role.
const nextTrends = internalQuery({
  args: vQueryArgs,
  returns: vQueryReturns,
  handler: async (ctx, { cursor }) => {
    const jobs = await ctx.db
      .query("jobs")
      .withIndex("by_creation_time", (q) =>
        q.gt("_creationTime", cursor ?? 0).lt("_creationTime", Date.now() - settledMs)
      )
      .take(batchSize)
    if (jobs.length === 0) return { kind: "idle" as const }
    const german = await germanBoards(ctx, jobs)
    return {
      kind: "work" as const,
      batch: { counts: tally(jobs, (id) => (german.has(id) ? "Germany" : undefined)) },
      cursor: jobs.at(-1)!._creationTime,
    }
  },
})

// The worker is the one writer, and its cursor commits with these counts, so a role counts once.
const addTrends = internalMutation({
  args: vMutationArgs,
  returns: vMutationReturns,
  handler: async (ctx, { counts }) => {
    for (const count of counts) {
      const row = await ctx.db
        .query("jobTrends")
        .withIndex("by_dimension_and_key_and_week", (q) =>
          q.eq("dimension", count.dimension).eq("key", count.key).eq("week", count.week)
        )
        .unique()
      if (row) await ctx.db.patch("jobTrends", row._id, { roles: row.roles + count.roles })
      else await ctx.db.insert("jobTrends", count)
    }
  },
})

// A batch worker can be left marked as running with nothing behind it, and then ignores pings
// (get-convex/batch-worker#12), so this kicks it too. Kicking a healthy one loses nothing: its
// cursor says where it was. ponytail: drop the kick once that's fixed upstream.
const countTrends = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    await ping(ctx, components.batchWorker, {
      name: worker,
      workQuery: internal.api.jobs.nextTrends,
      workerMutation: internal.api.jobs.addTrends,
    })
    await ctx.runMutation(components.batchWorker.lib.kick, { name: worker })
    return null
  },
})

// What had the most new roles last full week, and each one's recent weeks. `week` is this week's
// start, from `weekOf`, since a query can't read the clock.
// ponytail: ranks by one week, so a value can drop off after a quiet one. Keep a rolling total on
// the row if the list jumps around too much.
const trends = query({
  args: { dimension: vDimension, week: v.number() },
  returns: v.array(
    v.object({
      key: v.string(),
      label: v.string(),
      weeks: v.array(v.object({ week: v.number(), roles: v.number() })),
    })
  ),
  handler: async (ctx, { dimension, week }) => {
    const top = await ctx.db
      .query("jobTrends")
      .withIndex("by_dimension_and_week_and_roles", (q) =>
        q.eq("dimension", dimension).eq("week", week - weekMs)
      )
      .order("desc")
      .take(shown)
    return await Promise.all(
      top.map(async ({ key, label }) => {
        const rows = await ctx.db
          .query("jobTrends")
          .withIndex("by_dimension_and_key_and_week", (q) =>
            q
              .eq("dimension", dimension)
              .eq("key", key)
              .gt("week", week - weeksShown * weekMs)
              .lte("week", week)
          )
          .take(weeksShown)
        return { key, label, weeks: rows.map((r) => ({ week: r.week, roles: r.roles })) }
      })
    )
  },
})

export const trendsApi = { trends, countTrends, nextTrends, addTrends }
