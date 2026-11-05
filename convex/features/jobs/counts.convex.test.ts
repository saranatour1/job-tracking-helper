// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import aggregate from "@convex-dev/aggregate/test"
import shardedCounter from "@convex-dev/sharded-counter/test"
import workpool from "@convex-dev/workpool/test"
import { convexTest } from "convex-test"
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test"

import { api, internal } from "../../_generated/api"
import type { Id } from "../../_generated/dataModel"
import schema from "../../schema"
import { insertJob, recount } from "./counts"

const modules = import.meta.glob([
  "../../**/*.ts",
  "!../../components/notifications/**",
  "!../../**/*.test.ts",
])

const setup = () => {
  const t = convexTest(schema, modules)
  aggregate.register(t, "jobRoleCounts")
  aggregate.register(t, "jobTimeCounts")
  aggregate.register(t, "jobDomainCounts")
  shardedCounter.register(t)
  workpool.register(t, "catalogPool")
  workpool.register(t, "summaryPool")
  return t
}

type T = ReturnType<typeof setup>

beforeEach(() => void vi.useFakeTimers())
afterEach(() => void vi.useRealTimers())

const feedJob = (n: number, company = "Stripe") => ({
  url: `https://example.com/jobs/${n}`,
  title: `Role ${n}`,
  company,
  location: "",
  remote: false,
  postedAt: n,
  text: `Role ${n}`,
})

const addBoard = (t: T, slug: string, kind: "greenhouse" | "remoteok" = "greenhouse") =>
  t.run((ctx) => ctx.db.insert("jobBoards", { kind, slug, company: slug, addedAt: 0, jobs: 0 }))

const ready = (t: T) => t.run((ctx) => ctx.db.insert("jobCatalog", { boards: 0 }))

// A fetch saves, then ends with boardFetched, which brings the board's count up to date.
const save = async (t: T, boardId: Id<"jobBoards">, from: number, to: number, company?: string) => {
  await t.mutation(internal.api.jobs.saveJobs, {
    boardId,
    jobs: Array.from({ length: to - from }, (_, i) => feedJob(from + i, company)),
  })
  await t.mutation(internal.api.jobs.boardFetched, { boardId, jobs: to - from })
}

const close = async (t: T, boardId: Id<"jobBoards">, jobIds: Id<"jobs">[]) => {
  await t.mutation(internal.api.jobs.closeJobs, { jobIds })
  await t.mutation(internal.api.jobs.boardFetched, { boardId, jobs: 0 })
}

const research = (t: T, boardId: Id<"jobBoards">, domain?: string, link?: "postings" | "name") =>
  t.mutation(internal.api.jobs.saveResearch, {
    boardId,
    domain,
    link,
    credits: 0,
    exhausted: false,
  })

const summary = async (t: T) => {
  await t.finishAllScheduledFunctions(vi.runAllTimers)
  const stats = await t.query(api.api.jobs.stats, {})
  return { jobs: stats?.jobs, ...stats?.summary }
}

const jobIdsOf = (t: T, boardId: Id<"jobBoards">) =>
  t.run(async (ctx) =>
    (
      await ctx.db
        .query("jobs")
        .withIndex("by_boardId_and_postedAt", (q) => q.eq("boardId", boardId))
        .collect()
    ).map((j) => j._id)
  )

describe("the catalog's counts", () => {
  it("counts roles as they're saved, once each, however often a feed lists them", async () => {
    const t = setup()
    await ready(t)
    const boardId = await addBoard(t, "stripe")
    await research(t, boardId, "stripe.com", "postings")
    await save(t, boardId, 0, 3)
    await save(t, boardId, 1, 3)
    expect(await summary(t)).toEqual({
      jobs: 3,
      domains: 1,
      own: 3,
      name: 0,
      unverified: 0,
      endings: [{ ending: ".com", jobs: 3 }],
    })
    expect((await t.run((ctx) => ctx.db.get("jobBoards", boardId)))?.jobs).toBe(3)
  })

  it("leaves the shared totals to the queue, so saves side by side don't collide", async () => {
    const t = setup()
    await ready(t)
    const boardId = await addBoard(t, "stripe")
    await research(t, boardId, "stripe.com", "postings")
    await t.finishAllScheduledFunctions(vi.runAllTimers)
    await save(t, boardId, 0, 3)
    // The board's own count and the role rows are already there; the totals aren't yet.
    expect((await t.run((ctx) => ctx.db.get("jobBoards", boardId)))?.jobs).toBe(3)
    expect(await t.query(api.api.jobs.stats, {})).toMatchObject({
      jobs: 0,
      summary: { domains: 0 },
    })
    expect(await summary(t)).toMatchObject({ jobs: 3, domains: 1, own: 3 })
  })

  it("counts a board once a fetch, at its end, so long saves don't queue anything", async () => {
    const t = setup()
    await ready(t)
    const boardId = await addBoard(t, "stripe")
    await t.mutation(internal.api.jobs.saveJobs, { boardId, jobs: [feedJob(0), feedJob(1)] })
    expect((await t.run((ctx) => ctx.db.get("jobBoards", boardId)))?.jobs).toBe(0)
    await t.mutation(internal.api.jobs.boardFetched, { boardId, jobs: 2 })
    expect((await t.run((ctx) => ctx.db.get("jobBoards", boardId)))?.jobs).toBe(2)
    expect(await summary(t)).toMatchObject({ jobs: 2, unverified: 2 })
  })

  it("takes out closed roles, and a domain once its last role goes", async () => {
    const t = setup()
    await ready(t)
    const boardId = await addBoard(t, "stripe")
    await research(t, boardId, "stripe.com", "postings")
    await save(t, boardId, 0, 2)
    const jobIds = await jobIdsOf(t, boardId)
    await close(t, boardId, jobIds.slice(0, 1))
    expect(await summary(t)).toMatchObject({ jobs: 1, own: 1, domains: 1 })
    await close(t, boardId, jobIds)
    expect(await summary(t)).toEqual({
      jobs: 0,
      domains: 0,
      own: 0,
      name: 0,
      unverified: 0,
      endings: [],
    })
  })

  it("moves all a board's roles when research finds its site", async () => {
    const t = setup()
    await ready(t)
    const boardId = await addBoard(t, "hooli")
    await save(t, boardId, 0, 4)
    expect(await summary(t)).toMatchObject({ jobs: 4, unverified: 4, domains: 0, endings: [] })
    await research(t, boardId, "hooli.ai", "name")
    expect(await summary(t)).toMatchObject({
      jobs: 4,
      name: 4,
      unverified: 0,
      domains: 1,
      endings: [{ ending: ".ai", jobs: 4 }],
    })
    await research(t, boardId, "hooli.co", "postings")
    expect(await summary(t)).toMatchObject({
      name: 0,
      own: 4,
      domains: 1,
      endings: [{ ending: ".co", jobs: 4 }],
    })
  })

  it("counts a domain once and all of its roles, past the 20 boards it used to stop at", async () => {
    const t = setup()
    await ready(t)
    for (let n = 0; n < 21; n++) {
      const boardId = await addBoard(t, `stripe${n}`)
      await research(t, boardId, "stripe.com", "postings")
      await save(t, boardId, n, n + 1)
    }
    expect(await summary(t)).toMatchObject({ jobs: 21, domains: 1, own: 21 })
    const { page } = await t.query(api.api.jobs.search, {
      paginationOpts: { numItems: 1, cursor: null },
    })
    expect(page[0]?.evidence.open).toBe(21)
  })

  it("counts each company on a board of many, even when a feed renames one", async () => {
    const t = setup()
    await ready(t)
    const boardId = await addBoard(t, "all", "remoteok")
    await save(t, boardId, 0, 2, "Wren")
    await save(t, boardId, 2, 5, "Marlow")
    const open = async () => {
      const { page } = await t.query(api.api.jobs.search, {
        paginationOpts: { numItems: 10, cursor: null },
      })
      return Object.fromEntries(page.map((j) => [j.company, j.evidence]))
    }
    expect(await open()).toMatchObject({
      Wren: { open: 2, pooled: true },
      Marlow: { open: 3, pooled: true },
    })
    await save(t, boardId, 0, 1, "Marlow")
    expect(await open()).toMatchObject({ Wren: { open: 1 }, Marlow: { open: 4 } })
    expect(await summary(t)).toMatchObject({ jobs: 5, unverified: 5 })
  })

  it("forgets a search board left with no roles", async () => {
    const t = setup()
    await t.run((ctx) => ctx.db.insert("jobCatalog", { boards: 1 }))
    const boardId = await t.run((ctx) =>
      ctx.db.insert("jobBoards", {
        kind: "arbeitsagentur",
        slug: "search",
        company: "Search",
        addedAt: 0,
        jobs: 0,
      })
    )
    await save(t, boardId, 0, 2, "Wren")
    await close(t, boardId, await jobIdsOf(t, boardId))
    expect(await t.run((ctx) => ctx.db.get("jobBoards", boardId))).toBeNull()
    await t.finishAllScheduledFunctions(vi.runAllTimers)
    expect(await t.query(api.api.jobs.stats, {})).toMatchObject({ boards: 0, jobs: 0 })
  })

  it("leaves counts alone on a fetch, so they follow rows and not the feed's length", async () => {
    const t = setup()
    await ready(t)
    const boardId = await addBoard(t, "stripe")
    await save(t, boardId, 0, 2)
    await t.mutation(internal.api.jobs.boardFetched, { boardId, jobs: 300 })
    expect(await summary(t)).toMatchObject({ jobs: 2, unverified: 2 })
    expect((await t.run((ctx) => ctx.db.get("jobBoards", boardId)))?.jobs).toBe(2)
  })
})

describe("moving postings to their new keys", () => {
  it("removes a page of old copies, and the counts follow", async () => {
    const t = setup()
    await ready(t)
    const boardId = await addBoard(t, "stripe")
    await research(t, boardId, "stripe.com", "postings")
    await save(t, boardId, 0, 60)
    await t.run(async (ctx) => {
      for (let n = 0; n < 50; n++)
        await insertJob(ctx, { ...feedJob(n), boardId, urlKey: `old-${n}` })
      await recount(ctx, boardId)
    })
    expect(await summary(t)).toMatchObject({ jobs: 110, own: 110 })
    await t.mutation(internal.api.migrations.fillPostingKeys, {})
    await t.finishAllScheduledFunctions(vi.runAllTimers)
    expect(await summary(t)).toMatchObject({ jobs: 60, own: 60, domains: 1 })
    expect((await t.run((ctx) => ctx.db.get("jobBoards", boardId)))?.jobs).toBe(60)
  })
})
