// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { convexTest } from "convex-test"
import { describe, expect, it } from "vite-plus/test"

import { api } from "../../_generated/api"
import type { Id } from "../../_generated/dataModel"
import schema from "../../schema"
import { fillShortlist } from "./utils"

const modules = import.meta.glob([
  "../../**/*.ts",
  "!../../components/notifications/**",
  "!../../components/cloudflareEmail/**",
  "!../../**/*.test.ts",
])

const answers = {
  usePreferences: true,
  stretch: false,
  remoteOnly: true,
  nearMe: false,
  listedCompanies: false,
  skipRedFlags: true,
  postedToday: false,
}
const loop = {
  name: "Remote roles",
  template: "custom",
  prompt: "Frontend",
  answers,
  daily: 50,
  show: 5,
  at: "08:00",
  timeZone: "Asia/Hebron",
  auto: true,
} as const

describe("editing a loop", () => {
  it("changes its answers and moves its next run", async () => {
    const t = convexTest(schema, modules)
    const userId = await t.run((ctx) => ctx.db.insert("users", { name: "Sam" }))
    const as = t.withIdentity({ subject: userId })
    const loopId = await as.mutation(api.api.loops.create, loop)
    const before = await t.run((ctx) => ctx.db.get("loops", loopId))

    await as.mutation(api.api.loops.update, {
      loopId,
      ...loop,
      name: "Remote, fewer",
      prompt: "",
      daily: 25,
      at: "09:00",
      auto: false,
    })
    const after = await t.run((ctx) => ctx.db.get("loops", loopId))
    expect(after).toMatchObject({ name: "Remote, fewer", daily: 25, at: "09:00", active: false })
    expect(after?.prompt).toBeUndefined()
    expect(after?.nextRunAt).not.toBe(before?.nextRunAt)
  })

  it("won't change someone else's loop, or take answers create wouldn't", async () => {
    const t = convexTest(schema, modules)
    const [mine, theirs] = await t.run(async (ctx) => [
      await ctx.db.insert("users", { name: "Sam" }),
      await ctx.db.insert("users", { name: "Alex" }),
    ])
    const loopId = await t.withIdentity({ subject: mine }).mutation(api.api.loops.create, loop)
    await expect(
      t.withIdentity({ subject: theirs }).mutation(api.api.loops.update, { loopId, ...loop })
    ).rejects.toThrow("That loop doesn't exist.")
    await expect(
      t.withIdentity({ subject: mine }).mutation(api.api.loops.update, {
        loopId,
        ...loop,
        answers: { ...answers, nearMe: true },
      })
    ).rejects.toThrow("Pick remote only or on-site near you, not both.")
  })
})

describe("filling a shortlist", () => {
  const lead = (
    userId: Id<"users">,
    loopId: Id<"loops">,
    n: number,
    fit: number,
    status: "new" | "waiting" = "waiting"
  ) => ({
    userId,
    loopId,
    url: `https://x.dev/${n}`,
    urlKey: `x.dev/${n}`,
    title: "Engineer",
    company: "Hooli",
    snippet: "",
    fit,
    reasons: [],
    status,
    verdict: "fit" as const,
  })

  it("finds a loop's best roles behind another loop's long wait", async () => {
    const t = convexTest(schema, modules)
    const userId = await t.run((ctx) => ctx.db.insert("users", { name: "Sam" }))
    const as = t.withIdentity({ subject: userId })
    const busy = await as.mutation(api.api.loops.create, loop)
    const loopId = await as.mutation(api.api.loops.create, { ...loop, show: 3 })
    const best = await t.run(async (ctx) => {
      for (let n = 0; n < 301; n++) await ctx.db.insert("jobLeads", lead(userId, busy, n, 99))
      await ctx.db.insert("jobLeads", lead(userId, loopId, 1000, 10, "new"))
      for (const [n, fit] of [50, 90, 70].entries())
        await ctx.db.insert("jobLeads", lead(userId, loopId, 2000 + n, fit))
      return (await fillShortlist(ctx, loopId)).map((l) => l.fit)
    })
    expect(best).toEqual([90, 70])
    const left = await t.run((ctx) =>
      ctx.db
        .query("jobLeads")
        .withIndex("by_userId_and_status", (q) => q.eq("userId", userId).eq("status", "new"))
        .take(10)
    )
    expect(left.map((l) => l.fit).sort((a, b) => a - b)).toEqual([10, 70, 90])
  })
})
