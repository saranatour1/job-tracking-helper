// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import aggregate from "@convex-dev/aggregate/test"
import shardedCounter from "@convex-dev/sharded-counter/test"
import type { WorkId } from "@convex-dev/workpool"
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
  aggregate.register(t, "jobTimeCounts")
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
      summarizedText: "older text",
      summary: "Stale.",
      facts: null,
    })
    expect((await summariesOf(t))[0]!.summary).toBeUndefined()
    await t.mutation(internal.api.jobs.saveSummary, {
      jobId,
      summarizedText: role(1).text,
      summary: "Build the payments API.",
      facts: { level: "Senior", workMode: "Remote" },
    })
    expect((await summariesOf(t))[0]!.summary).toBe("Build the payments API.")
    expect(await t.run(async (ctx) => (await ctx.db.query("jobs").first())!.facts)).toEqual({
      level: "Senior",
      workMode: "Remote",
    })
  })

  it("leaves no role queued after its last attempt fails", async () => {
    const { t, boardId } = await setup()
    const jobId = await t.run((ctx) =>
      ctx.db.insert("jobs", { ...role(1), boardId, summarizedAt: 0 })
    )
    await t.mutation(internal.api.jobs.summaryEnded, {
      workId: "w" as WorkId,
      context: { jobId },
      result: { kind: "failed", error: "gateway down" },
    })
    const after = (await summariesOf(t))[0]!
    expect(after.summary).toBeUndefined()
    expect(after.summarizedAt).toBeGreaterThan(0)
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
      summarizedAt: 0,
    })
  })

  it("queues a new role as it's saved, and leaves older roles without one alone", async () => {
    const { t, boardId } = await setup()
    await t.run((ctx) => insertJob(ctx, { ...role(1), boardId }))
    await t.mutation(internal.api.jobs.saveJobs, { boardId, jobs: [feed(1), feed(2)] })
    expect(await summariesOf(t)).toEqual([
      { title: "Engineer 1", summary: undefined, summarizedAt: undefined },
      { title: "Engineer 2", summary: undefined, summarizedAt: 0 },
    ])
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

describe("a catalog role on someone's board", () => {
  it("adds it once as Saved, and brings it back from the Trash instead of adding it again", async () => {
    const { t, boardId } = await setup()
    const userId = await t.run((ctx) => ctx.db.insert("users", { name: "Sam" }))
    const as = t.withIdentity({ subject: userId })
    const jobId = await t.run((ctx) =>
      ctx.db.insert("jobs", { ...role(1), boardId, summary: "Build the payments API." })
    )
    const first = await as.mutation(api.api.jobs.track, { jobId })
    await t.run((ctx) => ctx.db.patch("applications", first, { trashedAt: 1 }))
    expect(await as.mutation(api.api.jobs.track, { jobId })).toBe(first)
    const apps = await t.run((ctx) => ctx.db.query("applications").take(5))
    expect(apps).toHaveLength(1)
    expect(apps[0]).toMatchObject({
      status: "saved",
      role: "Engineer 1",
      company: "Acme",
      description: "Build the payments API.",
    })
    expect(apps[0]!.trashedAt).toBeUndefined()
    expect(await as.query(api.api.jobs.match, { jobId })).toBeNull()

    // Judged afterwards, as "Does it match you?" does: the new lead points at the same row.
    const leadId = await t.run((ctx) =>
      ctx.db.insert("jobLeads", {
        userId,
        url: role(1).url,
        urlKey: role(1).urlKey,
        title: "Engineer 1",
        company: "Acme",
        snippet: "Engineer 1",
        fit: 32,
        reasons: ["The right field, but the wrong level."],
        status: "new",
        verdict: "notFit",
      })
    )
    await t.mutation(internal.api.jobs.linkTracked, { leadId })
    expect(await as.query(api.api.jobs.match, { jobId })).toEqual({
      fit: 32,
      verdict: "notFit",
      reasons: ["The right field, but the wrong level."],
      applicationId: first,
    })
  })
})

describe("counting what the filters match", () => {
  it("counts remote, posted-since and a board's roles exactly, and not words", async () => {
    const { t, boardId } = await setup()
    const other = await t.run((ctx) =>
      ctx.db.insert("jobBoards", { kind: "lever", slug: "b", company: "B", addedAt: 0, jobs: 0 })
    )
    await t.run(async (ctx) => {
      await insertJob(ctx, { ...role(1), boardId, postedAt: 100 })
      await insertJob(ctx, { ...role(2, { remote: true }), boardId, postedAt: 200 })
      await insertJob(ctx, { ...role(3, { remote: true }), boardId: other, postedAt: 300 })
    })
    const count = (args: { remoteOnly?: boolean; boardId?: string; since?: number; q?: string }) =>
      t.query(api.api.jobs.count, args)
    expect(await count({})).toBe(3)
    expect(await count({ remoteOnly: true })).toBe(2)
    expect(await count({ since: 200 })).toBe(2)
    expect(await count({ remoteOnly: true, since: 250 })).toBe(1)
    expect(await count({ boardId, remoteOnly: true })).toBe(1)
    expect(await count({ q: "engineer" })).toBeNull()
  })
})
