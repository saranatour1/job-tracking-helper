// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { convexTest } from "convex-test"
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test"

import { internal } from "./_generated/api"
import type { Id } from "./_generated/dataModel"
import { nextNumber } from "./features/applications/utils"
import schema from "./schema"

const modules = import.meta.glob(["./**/*.ts", "!./components/**", "!./**/*.test.ts"])

const application = (userId: Id<"users">, more = {}) => ({
  userId,
  company: "Hooli",
  role: "Engineer",
  status: "applied" as const,
  labels: [],
  ...more,
})

beforeEach(() => void vi.useFakeTimers())
afterEach(() => void vi.useRealTimers())

const runAll = async (t: ReturnType<typeof convexTest>) => {
  await t.mutation(internal.migrations.run, {})
  await t.finishAllScheduledFunctions(() => vi.runAllTimers())
}

describe("the old-rows migration", () => {
  it("fills numbers and history after the highest, and sets the counter", async () => {
    const t = convexTest(schema, modules)
    const { userId, old, numbered } = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", { autoApplyAt: 1, autoApplyDryRun: true })
      const old = await ctx.db.insert("applications", application(userId))
      const numbered = await ctx.db.insert(
        "applications",
        application(userId, { number: 7, history: [{ status: "applied", at: 5 }] })
      )
      return { userId, old, numbered }
    })
    expect((await t.query(internal.migrations.leftovers, {})).applications).toBe(1)
    await runAll(t)

    await t.run(async (ctx) => {
      const filled = await ctx.db.get("applications", old)
      expect(filled?.number).toBe(8)
      expect(filled?.history).toEqual([{ status: "applied", at: filled?._creationTime }])
      const kept = await ctx.db.get("applications", numbered)
      expect(kept?.number).toBe(7)
      expect(kept?.history).toEqual([{ status: "applied", at: 5 }])
      const user = await ctx.db.get("users", userId)
      expect(user?.nextApplicationNumber).toBe(9)
      expect(user?.autoApplyAt).toBeUndefined()
      expect(user?.autoApplyDryRun).toBeUndefined()
    })
    expect(await t.query(internal.migrations.leftovers, {})).toEqual({
      applications: 0,
      users: 0,
      reviews: 0,
      loops: 0,
    })
  })

  it("can run twice, even with an application added in between", async () => {
    const t = convexTest(schema, modules)
    const userId = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {})
      await ctx.db.insert("applications", application(userId))
      return userId
    })
    await runAll(t)
    expect(await t.run((ctx) => nextNumber(ctx, userId))).toBe(2)
    await runAll(t)
    expect(await t.run((ctx) => nextNumber(ctx, userId))).toBe(3)
  })

  it("rewrites old resume reviews", async () => {
    const t = convexTest(schema, modules)
    const prefId = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {})
      return ctx.db.insert("preferences", {
        userId,
        workMode: "any",
        resumeReview: {
          at: 1,
          contact: { links: [] },
          sections: [],
          checks: [],
          suggestions: [],
          words: 1,
          shows: [
            { tag: "a", shown: true },
            { tag: "b", shown: false },
            { tag: "c", shown: "unsure" },
          ],
        },
      })
    })
    await runAll(t)
    const row = await t.run((ctx) => ctx.db.get("preferences", prefId))
    expect(row?.resumeReview?.shows.map((s) => s.shown)).toEqual(["yes", "no", "unsure"])
  })
})

describe("the next number", () => {
  it("counts on without reusing a deleted one", async () => {
    const t = convexTest(schema, modules)
    const userId = await t.run((ctx) => ctx.db.insert("users", {}))
    expect(await t.run((ctx) => nextNumber(ctx, userId))).toBe(1)
    const two = await t.run(async (ctx) => {
      const number = await nextNumber(ctx, userId)
      return ctx.db.insert("applications", application(userId, { number }))
    })
    await t.run((ctx) => ctx.db.delete("applications", two))
    expect(await t.run((ctx) => nextNumber(ctx, userId))).toBe(3)
  })
})
