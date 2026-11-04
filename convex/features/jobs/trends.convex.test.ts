// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import aggregate from "@convex-dev/aggregate/test"
import batchWorker from "@convex-dev/batch-worker/test"
import shardedCounter from "@convex-dev/sharded-counter/test"
import workpool from "@convex-dev/workpool/test"
import { convexTest } from "convex-test"
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test"

import { api, internal } from "../../_generated/api"
import schema from "../../schema"
import { deleteJob, insertJob } from "./counts"
import { weekMs, weekOf } from "./dimensions"

const modules = import.meta.glob([
  "../../**/*.ts",
  "!../../components/notifications/**",
  "!../../components/cloudflareEmail/**",
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
  batchWorker.register(t)
  return t
}

const now = Date.UTC(2026, 10, 4)
const thisWeek = weekOf(now)
const lastWeek = thisWeek - weekMs

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(now)
})
afterEach(() => void vi.useRealTimers())

let urls = 0
const job = (title: string, location: string, postedAt: number, remote = false) => ({
  urlKey: `example.com/${++urls}`,
  url: `https://example.com/${urls}`,
  title,
  company: "Stripe",
  location,
  remote,
  postedAt,
  text: title,
})

const addBoard = (t: ReturnType<typeof setup>, kind: "greenhouse" | "arbeitsagentur") =>
  t.run((ctx) =>
    ctx.db.insert("jobBoards", { kind, slug: kind, company: kind, addedAt: 0, jobs: 0 })
  )

// Runs what the worker runs, a batch at a time, till it goes idle.
const drain = async (t: ReturnType<typeof setup>, from?: number) => {
  let cursor = from
  for (;;) {
    vi.setSystemTime(Date.now() + 2 * 60 * 1000)
    const next = await t.query(internal.api.jobs.nextTrends, { name: "jobTrends", cursor })
    if (next.kind === "idle") return cursor
    await t.mutation(internal.api.jobs.addTrends, next.batch)
    cursor = next.cursor as number
  }
}

const list = (t: ReturnType<typeof setup>, dimension: "country" | "place" | "title") =>
  t.query(api.api.jobs.trends, { dimension, week: thisWeek })

describe("job trends", () => {
  it("counts each role once, per week posted, and keeps counting after it closes", async () => {
    const t = setup()
    const boardId = await addBoard(t, "greenhouse")
    const closing = job("Senior Software Engineer, Payments", "Berlin, Germany", lastWeek)
    await t.run(async (ctx) => {
      await insertJob(ctx, { ...closing, boardId })
      await insertJob(ctx, {
        ...job("Software Engineer II", "Remote - USA", lastWeek, true),
        boardId,
      })
      await insertJob(ctx, { ...job("Software Engineer", "Paris, France", thisWeek), boardId })
    })
    const cursor = await drain(t)

    await t.run(async (ctx) => {
      const rows = await ctx.db.query("jobs").collect()
      await deleteJob(ctx, rows[0]!)
      await insertJob(ctx, { ...job("Designer", "Berlin", lastWeek), boardId })
    })
    await drain(t, cursor)

    const titles = await list(t, "title")
    expect(titles.map((r) => r.label)).toEqual(["Software Engineer", "Designer"])
    expect(titles[0]!.weeks).toEqual([
      { week: lastWeek, roles: 2 },
      { week: thisWeek, roles: 1 },
    ])

    const countries = await list(t, "country")
    expect(countries[0]).toMatchObject({ label: "Germany" })
    expect(countries[0]!.weeks).toEqual([{ week: lastWeek, roles: 2 }])
    expect((await list(t, "place")).map((r) => r.label).sort()).toEqual(["Berlin", "Remote"])
  })

  it("places Arbeitsagentur's towns in Germany", async () => {
    const t = setup()
    const boardId = await addBoard(t, "arbeitsagentur")
    await t.run((ctx) => insertJob(ctx, { ...job("Koch (m/w/d)", "Bremen", lastWeek), boardId }))
    await drain(t)
    expect((await list(t, "country")).map((r) => r.label)).toEqual(["Germany"])
    expect((await list(t, "title")).map((r) => r.label)).toEqual(["Koch"])
  })

  it("leaves a role saved a moment ago for the next run", async () => {
    const t = setup()
    const boardId = await addBoard(t, "greenhouse")
    await t.run((ctx) => insertJob(ctx, { ...job("Cook", "Bremen", lastWeek), boardId }))
    const next = await t.query(internal.api.jobs.nextTrends, { name: "jobTrends" })
    expect(next.kind).toBe("idle")
  })
})
