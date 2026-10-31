// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { convexTest } from "convex-test"
import { describe, expect, it } from "vite-plus/test"

import { api, internal } from "../../_generated/api"
import type { Id } from "../../_generated/dataModel"
import schema from "../../schema"
import { countCatalog } from "./utils"

const modules = import.meta.glob([
  "../../**/*.ts",
  "!../../components/notifications/**",
  "!../../components/cloudflareEmail/**",
  "!../../**/*.test.ts",
])

const board = (n: number, jobs: number) => ({
  kind: "greenhouse" as const,
  slug: `company${n}`,
  company: `Company ${String(n).padStart(4, "0")}`,
  addedAt: 0,
  jobs,
})

const setup = async () => {
  const t = convexTest(schema, modules)
  const userId = await t.run((ctx) => ctx.db.insert("users", { name: "Sam" }))
  return { t, as: t.withIdentity({ subject: userId }) }
}

describe("the job catalog's totals", () => {
  it("has none until it's first counted, rather than a wrong zero", async () => {
    const { as } = await setup()
    expect(await as.query(api.api.jobs.stats, {})).toBeNull()
  })

  it("stays right past the old limit of 1,000 boards", async () => {
    const { t, as } = await setup()
    await t.run(async (ctx) => {
      for (let n = 0; n < 1001; n++) await ctx.db.insert("jobBoards", board(n, 2))
      await countCatalog(ctx, {})
    })
    expect(await as.query(api.api.jobs.stats, {})).toEqual({ boards: 1001, jobs: 2002 })
  })

  it("follows a fetch, a failed fetch and a new board", async () => {
    const { t, as } = await setup()
    const boardId: Id<"jobBoards"> = await t.run(async (ctx) => {
      const id = await ctx.db.insert("jobBoards", board(1, 5))
      await countCatalog(ctx, {})
      return id
    })
    const fetched = { boardId, startedAt: 0 }
    await t.mutation(internal.api.jobs.boardFetched, { ...fetched, jobs: 8 })
    expect(await as.query(api.api.jobs.stats, {})).toEqual({ boards: 1, jobs: 8 })
    // A failed fetch keeps what the board had.
    await t.mutation(internal.api.jobs.boardFetched, { ...fetched, jobs: 0, error: "Down" })
    expect(await as.query(api.api.jobs.stats, {})).toEqual({ boards: 1, jobs: 8 })
    await t.mutation(internal.api.jobs.ensureBoard, { kind: "lever", slug: "hooli" })
    await t.mutation(internal.api.jobs.ensureBoard, { kind: "lever", slug: "hooli" })
    expect(await as.query(api.api.jobs.stats, {})).toEqual({ boards: 2, jobs: 8 })
  })

  it("counts what's there when the first change comes, once", async () => {
    const { t, as } = await setup()
    const boardId = await t.run((ctx) => ctx.db.insert("jobBoards", board(1, 5)))
    await t.mutation(internal.api.jobs.boardFetched, { boardId, startedAt: 0, jobs: 9 })
    expect(await as.query(api.api.jobs.stats, {})).toEqual({ boards: 1, jobs: 9 })
  })
})

describe("duplicates", () => {
  const feedJob = (url: string, location = "Manila") => ({
    url,
    title: "Support Specialist",
    company: "Coinbase",
    location,
    remote: false,
    postedAt: 1,
    text: "Support Specialist at Coinbase",
  })
  const lead = (userId: Id<"users">, urlKey: string, roleKey?: string) => ({
    userId,
    url: `https://${urlKey}`,
    urlKey,
    ...(roleKey && { roleKey }),
    title: "Support Specialist",
    company: "Coinbase",
    snippet: "",
    fit: 80,
    reasons: [],
    status: "new" as const,
    verdict: "fit" as const,
  })
  const pick = (t: ReturnType<typeof convexTest>, userId: Id<"users">) =>
    t.query(internal.api.jobs.candidates, {
      userId,
      queries: ["support"],
      remoteOnly: false,
      companies: [],
      limit: 10,
    })

  const save = async (t: ReturnType<typeof convexTest>, jobs: ReturnType<typeof feedJob>[]) => {
    const boardId = await t.run((ctx) => ctx.db.insert("jobBoards", board(1, 0)))
    await t.mutation(internal.api.jobs.saveJobs, { boardId, jobs, seenAt: 1 })
    return boardId
  }
  const owner = (t: ReturnType<typeof convexTest>) =>
    t.run((ctx) => ctx.db.insert("users", { name: "Pat" }))

  it("saves a Greenhouse posting once, whichever link the feed gives", async () => {
    const { t } = await setup()
    await save(t, [
      feedJob("https://www.coinbase.com/careers/positions/1?gh_jid=1"),
      feedJob("https://job-boards.greenhouse.io/coinbase/jobs/1"),
    ])
    const jobs = await t.run((ctx) => ctx.db.query("jobs").take(5))
    expect(jobs.map((j) => j.urlKey)).toEqual(["greenhouse/1"])
  })

  it("gives a loop one posting of a role, and each place's role its own", async () => {
    const { t } = await setup()
    const userId = await owner(t)
    await save(t, [
      feedJob("https://x.dev/a?gh_jid=1"),
      feedJob("https://x.dev/a?gh_jid=2"),
      feedJob("https://x.dev/a?gh_jid=3", "Hyderabad"),
    ])
    expect(await pick(t, userId)).toHaveLength(2)
  })

  it("picks a role's newer posting when an older one is too old", async () => {
    const { t } = await setup()
    const userId = await owner(t)
    await save(t, [
      { ...feedJob("https://x.dev/a?gh_jid=1"), postedAt: 1 },
      { ...feedJob("https://x.dev/a?gh_jid=2"), postedAt: 100 },
    ])
    const picked = await t.query(internal.api.jobs.candidates, {
      userId,
      queries: ["support"],
      remoteOnly: false,
      companies: [],
      since: 50,
      limit: 10,
    })
    const jobs = await t.run((ctx) => Promise.all(picked.map((id) => ctx.db.get("jobs", id))))
    expect(jobs.map((j) => j?.urlKey)).toEqual(["greenhouse/2"])
  })

  it("skips another posting of a role the person was shown", async () => {
    const { t } = await setup()
    const userId = await owner(t)
    await save(t, [feedJob("https://x.dev/a?gh_jid=2")])
    await t.run((ctx) =>
      ctx.db.insert("jobLeads", lead(userId, "greenhouse/1", "coinbase|support specialist|manila"))
    )
    expect(await pick(t, userId)).toEqual([])
  })

  it("moves stored postings to the new keys, keeping leads on their role", async () => {
    const { t } = await setup()
    const userId = await owner(t)
    const url = "https://www.coinbase.com/careers/positions/1?gh_jid=1"
    const boardId = await t.run((ctx) => ctx.db.insert("jobBoards", board(1, 0)))
    const oldKey = "coinbase.com/careers/positions/1?gh_jid=1"
    const jobId = await t.run((ctx) =>
      ctx.db.insert("jobs", { ...feedJob(url), boardId, urlKey: oldKey, seenAt: 1 })
    )
    // A refresh got there first, so this one has a newer copy to give way to.
    const stale = await t.run((ctx) =>
      ctx.db.insert("jobs", {
        ...feedJob("https://job-boards.greenhouse.io/coinbase/jobs/1"),
        boardId,
        urlKey: "job-boards.greenhouse.io/coinbase/jobs/1",
        seenAt: 1,
      })
    )
    const leadId = await t.run((ctx) =>
      ctx.db.insert("jobLeads", {
        ...lead(userId, "job-boards.greenhouse.io/coinbase/jobs/1"),
        url: "https://job-boards.greenhouse.io/coinbase/jobs/1",
        location: "Manila",
      })
    )
    const prefillId = await t.run((ctx) =>
      ctx.db.insert("prefills", {
        userId,
        url,
        urlKey: oldKey,
        company: "Coinbase",
        title: "Support Specialist",
        status: "ready",
        fields: [],
      })
    )

    expect(await t.query(internal.api.migrations.postingKeysLeft, {})).toBe(2)
    await t.mutation(internal.api.migrations.fillPostingKeys, {})
    await t.finishAllScheduledFunctions(() => undefined)

    expect(await t.query(internal.api.migrations.postingKeysLeft, {})).toBe(0)
    const { kept, gone, moved, prefill } = await t.run(async (ctx) => ({
      kept: await ctx.db.get("jobs", jobId),
      gone: await ctx.db.get("jobs", stale),
      moved: await ctx.db.get("jobLeads", leadId),
      prefill: await ctx.db.get("prefills", prefillId),
    }))
    expect(kept?.urlKey).toBe("greenhouse/1")
    expect(gone).toBeNull()
    expect(moved).toMatchObject({
      urlKey: "greenhouse/1",
      roleKey: "coinbase|support specialist|manila",
      jobId,
    })
    expect(prefill?.urlKey).toBe("greenhouse/1")
  })
})

describe("the company filter", () => {
  it("lists the 200 with the most roles, past the old limit, without empty boards", async () => {
    const { t, as } = await setup()
    await t.run(async (ctx) => {
      for (let n = 0; n < 1001; n++) await ctx.db.insert("jobBoards", board(n, n % 2 ? n : 0))
    })
    const companies = await as.query(api.api.jobs.companies, {})
    expect(companies).toHaveLength(200)
    expect(companies[0]?.jobs).toBe(999)
    expect(companies.at(-1)?.jobs).toBe(999 - 199 * 2)
    expect(companies.every((c) => c.jobs > 0)).toBe(true)
  })

  it("orders the same counts by company", async () => {
    const { t, as } = await setup()
    await t.run(async (ctx) => {
      await ctx.db.insert("jobBoards", board(2, 5))
      await ctx.db.insert("jobBoards", board(1, 5))
    })
    expect((await as.query(api.api.jobs.companies, {})).map((c) => c.company)).toEqual([
      "Company 0001",
      "Company 0002",
    ])
  })
})
