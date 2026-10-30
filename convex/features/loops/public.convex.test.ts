// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { convexTest } from "convex-test"
import { describe, expect, it } from "vite-plus/test"

import { api } from "../../_generated/api"
import schema from "../../schema"

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
    const loopId = await as.mutation(api.loops.create, loop)
    const before = await t.run((ctx) => ctx.db.get("loops", loopId))

    await as.mutation(api.loops.update, {
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
    const loopId = await t.withIdentity({ subject: mine }).mutation(api.loops.create, loop)
    await expect(
      t.withIdentity({ subject: theirs }).mutation(api.loops.update, { loopId, ...loop })
    ).rejects.toThrow("That loop doesn't exist.")
    await expect(
      t.withIdentity({ subject: mine }).mutation(api.loops.update, {
        loopId,
        ...loop,
        answers: { ...answers, nearMe: true },
      })
    ).rejects.toThrow("Pick remote only or on-site near you, not both.")
  })
})
