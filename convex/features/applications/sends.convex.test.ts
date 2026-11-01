// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import batchWorker from "@convex-dev/batch-worker/test"
import rateLimiter from "@convex-dev/rate-limiter/test"
import workpool from "@convex-dev/workpool/test"
import { convexTest } from "convex-test"
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test"

import { api, internal } from "../../_generated/api"
import type { Id } from "../../_generated/dataModel"
import cloudflareSchema from "../../components/cloudflareEmail/schema"
import notificationsSchema from "../../components/notifications/schema"
import schema from "../../schema"

const modules = import.meta.glob([
  "../../**/*.ts",
  "!../../components/notifications/**",
  "!../../components/cloudflareEmail/**",
  "!../../**/*.test.ts",
])

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubEnv("SECRETS_KEYS", `v1:${btoa(String.fromCharCode(...new Uint8Array(32).fill(7)))}`)
})

afterEach(() => {
  vi.useRealTimers()
})

const setup = async () => {
  const t = convexTest(schema, modules)
  batchWorker.register(t)
  rateLimiter.register(t)
  workpool.register(t, "applyPool")
  t.registerComponent(
    "notifications",
    notificationsSchema,
    import.meta.glob("../../components/notifications/**/*.ts")
  )
  t.registerComponent(
    "cloudflareEmail",
    cloudflareSchema,
    import.meta.glob("../../components/cloudflareEmail/**/*.ts")
  )
  const userId = await t.run((ctx) => ctx.db.insert("users", { name: "Sam" }))
  const as = t.withIdentity({ subject: userId })
  const add = (status: "saved" | "applied") =>
    as.mutation(api.api.applications.add, { company: "Hooli", role: "Engineer", status })
  const sends = () => as.query(api.api.applications.sends, {})
  return { t, userId, as, add, sends }
}

describe("what counts as sent", () => {
  it("counts one sent at the start, and not one saved", async () => {
    const { add, sends } = await setup()
    await add("saved")
    expect(await sends()).toEqual([])
    await add("applied")
    expect(await sends()).toHaveLength(1)
  })

  it("counts an application once, from the first move past Saved", async () => {
    const { as, add, sends } = await setup()
    const id = await add("saved")
    await as.mutation(api.api.applications.setStatus, { id, status: "applied" })
    const first = await sends()
    expect(first).toHaveLength(1)
    vi.advanceTimersByTime(1000)
    await as.mutation(api.api.applications.setStatus, { id, status: "interviewing" })
    await as.mutation(api.api.applications.setStatus, { id, status: "rejected" })
    expect(await sends()).toEqual(first)
  })

  it("takes it off when it goes back to Saved", async () => {
    const { as, add, sends } = await setup()
    const id = await add("applied")
    await as.mutation(api.api.applications.setStatus, { id, status: "saved" })
    expect(await sends()).toEqual([])
  })

  it("keeps it through the Trash and deleting for good", async () => {
    const { as, add, sends } = await setup()
    const id = await add("applied")
    await as.mutation(api.api.applications.trash, { id })
    await as.mutation(api.api.applications.deleteForever, { id })
    expect(await sends()).toHaveLength(1)
  })

  it("shows nobody else's", async () => {
    const { t, add } = await setup()
    await add("applied")
    const other = await t.run((ctx) => ctx.db.insert("users", { name: "Alex" }))
    const theirs = t.withIdentity({ subject: other })
    expect(await theirs.query(api.api.applications.sends, {})).toEqual([])
  })
})

describe("filling in old applications", () => {
  const row = (userId: Id<"users">, status: "saved" | "applied" | "withdrawn", at: number) => ({
    userId,
    company: "Hooli",
    role: "Engineer",
    status,
    number: 1,
    history: [
      { status: "saved" as const, at: at - 5 },
      ...(status === "saved" ? [] : [{ status, at }]),
    ],
  })

  it("uses the first sent event, includes the Trash, skips what wasn't sent, and can run again", async () => {
    const { t, userId, sends } = await setup()
    await t.run(async (ctx) => {
      await ctx.db.insert("applications", row(userId, "applied", 100))
      await ctx.db.insert("applications", { ...row(userId, "applied", 200), trashedAt: 300 })
      await ctx.db.insert("applications", row(userId, "saved", 400))
      await ctx.db.insert("applications", row(userId, "withdrawn", 500))
    })
    await t.mutation(internal.api.migrations.fillSends, {})
    await t.mutation(internal.api.migrations.fillSends, {})
    expect(await sends()).toEqual([200, 100])
    expect(await t.query(internal.api.migrations.sendsLeft, {})).toBe(0)
  })
})
