// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import aggregate from "@convex-dev/aggregate/test"
import batchWorker from "@convex-dev/batch-worker/test"
import shardedCounter from "@convex-dev/sharded-counter/test"
import { convexTest } from "convex-test"
import { describe, expect, it } from "vite-plus/test"

import { api, internal } from "../../_generated/api"
import schema from "../../schema"
import { deleteJob, insertJob } from "./counts"

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
  batchWorker.register(t)
  return t
}

// Runs what the worker runs, a batch at a time, till it goes idle.
const drain = async (t: ReturnType<typeof setup>) => {
  let cursor: { round: number; after: number } | undefined
  for (;;) {
    const next = await t.query(internal.api.jobs.nextSitemap, { name: "jobsSitemap", cursor })
    if (next.kind === "idle") return
    await t.mutation(internal.api.jobs.addSitemap, next.batch)
    cursor = next.cursor as typeof cursor
  }
}

describe("jobs sitemap", () => {
  it("shows a round once it's whole, and drops the last one", async () => {
    const t = setup()
    const titles = Array.from({ length: 501 }, (_, n) => `Role ${n}`)
    await t.run(async (ctx) => {
      await ctx.db.insert("jobCatalog", { boards: 1 })
      const boardId = await ctx.db.insert("jobBoards", {
        kind: "greenhouse",
        slug: "stripe",
        company: "Stripe",
        addedAt: 0,
        jobs: 0,
      })
      await Promise.all(
        titles.map((title, n) =>
          insertJob(ctx, {
            urlKey: `example.com/${n}`,
            url: `https://example.com/${n}`,
            title,
            company: "Stripe",
            location: "Berlin",
            remote: false,
            postedAt: n,
            text: title,
            boardId,
          })
        )
      )
    })
    expect(await t.query(api.api.jobs.sitemapRoles, {})).toEqual([])

    await t.mutation(internal.api.jobs.startSitemap, {})
    await drain(t)
    expect((await t.query(api.api.jobs.sitemapRoles, {})).flat()).toHaveLength(501)

    await t.run(async (ctx) => deleteJob(ctx, (await ctx.db.query("jobs").first())!))
    await t.mutation(internal.api.jobs.startSitemap, {})
    await drain(t)
    const roles = (await t.query(api.api.jobs.sitemapRoles, {})).flat()
    expect(roles.length).toBe(500)
    expect(roles.some((r) => r.title === "Role 0")).toBe(false)
    expect(await t.run((ctx) => ctx.db.query("sitemapPages").take(10))).toHaveLength(1)
  })
})
