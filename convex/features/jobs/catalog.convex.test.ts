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
