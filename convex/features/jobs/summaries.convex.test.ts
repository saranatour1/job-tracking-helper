// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import aggregate from "@convex-dev/aggregate/test"
import shardedCounter from "@convex-dev/sharded-counter/test"
import workpool from "@convex-dev/workpool/test"
import { convexTest } from "convex-test"
import { describe, expect, it } from "vite-plus/test"

import { api, internal } from "../../_generated/api"
import schema from "../../schema"
import { urlKey } from "../workflows/fit"
import { insertJob } from "./counts"

const modules = import.meta.glob([
  "../../**/*.ts",
  "!../../components/notifications/**",
  "!../../components/cloudflareEmail/**",
  "!../../**/*.test.ts",
])

const feed = (n: number) => ({
  url: `https://boards.greenhouse.io/acme/jobs/${n}`,
  title: `Engineer ${n}`,
  company: "Acme",
  location: "Berlin, Germany",
  remote: false,
  postedAt: n,
  text: `Engineer ${n}\n\nBuild the payments API.`,
})

const role = (n: number, extra: { remote?: boolean; summarizedAt?: number } = {}) => ({
  ...feed(n),
  urlKey: urlKey(feed(n).url),
  ...extra,
})

const setup = async () => {
  const t = convexTest(schema, modules)
  aggregate.register(t, "jobRoleCounts")
  aggregate.register(t, "jobDomainCounts")
  shardedCounter.register(t)
  workpool.register(t, "catalogPool")
  workpool.register(t, "summaryPool")
  const boardId = await t.run((ctx) =>
    ctx.db.insert("jobBoards", {
      kind: "greenhouse",
      slug: "acme",
      company: "Acme",
      addedAt: 0,
      jobs: 0,
    })
  )
  return { t, boardId }
}

const summariesOf = (t: Awaited<ReturnType<typeof setup>>["t"]) =>
  t.run(async (ctx) =>
    (await ctx.db.query("jobs").take(10)).map((j) => ({
      title: j.title,
      summary: j.summary,
      summarizedAt: j.summarizedAt,
    }))
  )

describe("role summaries", () => {
  it("queues only roles without one, and marks them so the next run skips them", async () => {
    const { t, boardId } = await setup()
    await t.run(async (ctx) => {
      await insertJob(ctx, { ...role(1), boardId })
      await insertJob(ctx, { ...role(2, { summarizedAt: 5 }), boardId })
    })
    expect(await t.mutation(internal.api.jobs.summarizeDue, {})).toBe(1)
    expect(await t.mutation(internal.api.jobs.summarizeDue, {})).toBe(0)
    expect(await summariesOf(t)).toEqual([
      { title: "Engineer 1", summary: undefined, summarizedAt: 0 },
      { title: "Engineer 2", summary: undefined, summarizedAt: 5 },
    ])
  })

  it("saves a summary, but not one written for text that has since changed", async () => {
    const { t, boardId } = await setup()
    const jobId = await t.run((ctx) => ctx.db.insert("jobs", { ...role(1), boardId }))
    await t.mutation(internal.api.jobs.saveSummary, {
      jobId,
      text: "older text",
      summary: "Stale.",
      facts: null,
    })
    expect((await summariesOf(t))[0]!.summary).toBeUndefined()
    await t.mutation(internal.api.jobs.saveSummary, {
      jobId,
      text: role(1).text,
      summary: "Build the payments API.",
      facts: { level: "Senior", workMode: "Remote" },
    })
    expect((await summariesOf(t))[0]!.summary).toBe("Build the payments API.")
    expect(await t.run(async (ctx) => (await ctx.db.query("jobs").first())!.facts)).toEqual({
      level: "Senior",
      workMode: "Remote",
    })
  })

  it("asks again when a feed changes a role's text, and not when it doesn't", async () => {
    const { t, boardId } = await setup()
    await t.run((ctx) =>
      ctx.db.insert("jobs", { ...role(1), boardId, summary: "Old.", summarizedAt: 5 })
    )
    await t.mutation(internal.api.jobs.saveJobs, { boardId, jobs: [feed(1)] })
    expect((await summariesOf(t))[0]).toMatchObject({ summary: "Old.", summarizedAt: 5 })
    await t.mutation(internal.api.jobs.saveJobs, {
      boardId,
      jobs: [{ ...feed(1), text: "Engineer 1\n\nNow it's the billing API." }],
    })
    expect((await summariesOf(t))[0]).toEqual({
      title: "Engineer 1",
      summary: undefined,
      summarizedAt: undefined,
    })
  })
})

describe("searching without an account", () => {
  it("narrows by remote, and ignores Fits me", async () => {
    const { t, boardId } = await setup()
    await t.run(async (ctx) => {
      await insertJob(ctx, { ...role(1), boardId })
      await insertJob(ctx, { ...role(2, { remote: true }), boardId })
    })
    const found = await t.query(api.api.jobs.search, {
      remoteOnly: true,
      fits: true,
      paginationOpts: { numItems: 25, cursor: null },
    })
    expect(found.page.map((r) => [r.title, r.places])).toEqual([
      ["Engineer 2", ["Berlin", "Remote", "Germany"]],
    ])
  })
})
