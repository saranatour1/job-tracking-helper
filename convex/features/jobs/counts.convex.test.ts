// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import aggregate from "@convex-dev/aggregate/test"
import batchWorker from "@convex-dev/batch-worker/test"
import shardedCounter from "@convex-dev/sharded-counter/test"
import { convexTest } from "convex-test"
import { describe, expect, it } from "vite-plus/test"

import { api, internal } from "../../_generated/api"
import type { Id } from "../../_generated/dataModel"
import schema from "../../schema"

const modules = import.meta.glob([
  "../../**/*.ts",
  "!../../components/notifications/**",
  "!../../components/cloudflareEmail/**",
  "!../../**/*.test.ts",
])

const setup = () => {
  const t = convexTest(schema, modules)
  aggregate.register(t, "jobRoleCounts")
  aggregate.register(t, "jobDomainCounts")
  shardedCounter.register(t)
  batchWorker.register(t)
  return t
}

type T = ReturnType<typeof setup>

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
  t.run((ctx) =>
    ctx.db.insert("jobBoards", { kind, slug, company: slug, addedAt: 0, jobs: 0, counted: true })
  )

const ready = (t: T) =>
  t.run((ctx) => ctx.db.insert("jobCatalog", { boards: 0, jobs: 0, countsReady: true }))

const save = (t: T, boardId: Id<"jobBoards">, from: number, to: number, company?: string) =>
  t.mutation(internal.api.jobs.saveJobs, {
    boardId,
    jobs: Array.from({ length: to - from }, (_, i) => feedJob(from + i, company)),
  })

const research = (t: T, boardId: Id<"jobBoards">, domain?: string, link?: "postings" | "name") =>
  t.mutation(internal.api.jobs.saveResearch, {
    boardId,
    domain,
    link,
    credits: 0,
    exhausted: false,
  })

const summary = async (t: T) => {
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

  it("takes out closed roles, and a domain once its last role goes", async () => {
    const t = setup()
    await ready(t)
    const boardId = await addBoard(t, "stripe")
    await research(t, boardId, "stripe.com", "postings")
    await save(t, boardId, 0, 2)
    const jobIds = await jobIdsOf(t, boardId)
    await t.mutation(internal.api.jobs.closeJobs, { jobIds: jobIds.slice(0, 1) })
    expect(await summary(t)).toMatchObject({ jobs: 1, own: 1, domains: 1 })
    await t.mutation(internal.api.jobs.closeJobs, { jobIds })
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
    await t.run((ctx) => ctx.db.insert("jobCatalog", { boards: 1, jobs: 0, countsReady: true }))
    const boardId = await t.run((ctx) =>
      ctx.db.insert("jobBoards", {
        kind: "arbeitsagentur",
        slug: "search",
        company: "Search",
        addedAt: 0,
        jobs: 0,
        counted: true,
      })
    )
    await save(t, boardId, 0, 2, "Wren")
    await t.mutation(internal.api.jobs.closeJobs, { jobIds: await jobIdsOf(t, boardId) })
    await t.mutation(internal.api.jobs.boardFetched, { boardId, jobs: 0 })
    expect(await t.run((ctx) => ctx.db.get("jobBoards", boardId))).toBeNull()
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

describe("filling the counts", () => {
  const fill = async (t: T) => {
    await t.mutation(internal.api.migrations.fillJobCounts, {})
    await t.finishAllScheduledFunctions(() => {})
  }

  it("keeps the old numbers until it's done, then switches to exact ones", async () => {
    const t = setup()
    const { stripe, hooli } = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Stripe", domain: "stripe.com" })
      const board = { kind: "greenhouse" as const, company: "", addedAt: 0 }
      // Says 300 for a feed that lists 3 roles over and over, as boards do today.
      const stripe = await ctx.db.insert("jobBoards", {
        ...board,
        slug: "stripe",
        jobs: 300,
        companyId,
        companyLink: "postings",
      })
      const hooli = await ctx.db.insert("jobBoards", { ...board, slug: "hooli", jobs: 2 })
      await ctx.db.insert("jobCatalog", { boards: 2, jobs: 302 })
      for (const [i, boardId] of [stripe, stripe, stripe, hooli, hooli].entries())
        await ctx.db.insert("jobs", { ...feedJob(i), boardId, urlKey: `key${i}` })
      return { stripe, hooli }
    })
    expect(await t.query(api.api.jobs.stats, {})).toEqual({ boards: 2, jobs: 302 })

    // A refresh before the fill reaches these boards is counted too, and no role twice.
    await save(t, hooli, 10, 11)
    const closing = (await jobIdsOf(t, stripe))[0]!
    await t.mutation(internal.api.jobs.closeJobs, { jobIds: [closing] })

    await fill(t)
    expect(await t.query(internal.api.migrations.jobCountsLeft, {})).toEqual({
      boards: 0,
      ready: true,
    })
    expect(await summary(t)).toEqual({
      jobs: 5,
      domains: 1,
      own: 2,
      name: 0,
      unverified: 3,
      endings: [{ ending: ".com", jobs: 2 }],
    })

    // And it changes nothing run again.
    await fill(t)
    await save(t, stripe, 20, 21)
    expect(await summary(t)).toMatchObject({ jobs: 6, own: 3, unverified: 3 })
  })

  it("stops writing the old summary once it's done", async () => {
    const t = setup()
    await ready(t)
    await t.mutation(internal.api.jobs.summarizeCatalog, {})
    const row = await t.run((ctx) => ctx.db.query("jobCatalog").first())
    expect(row?.summary).toBeUndefined()
  })
})
