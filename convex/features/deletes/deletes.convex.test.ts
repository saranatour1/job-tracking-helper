// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import username from "@convex-dev/auth/components/username/test"
import batchWorker from "@convex-dev/batch-worker/test"
import mcp from "@convex-dev/mcp/test"
import rateLimiter from "@convex-dev/rate-limiter/test"
import workpool from "@convex-dev/workpool/test"
import { convexTest } from "convex-test"
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test"

import { api, components, internal } from "../../_generated/api"
import type { Id } from "../../_generated/dataModel"
import cloudflareSchema from "../../components/cloudflareEmail/schema"
import notificationsSchema from "../../components/notifications/schema"
import schema from "../../schema"
import { startDelete } from "./utils"

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

const day = 24 * 60 * 60 * 1000

const setup = async () => {
  const t = convexTest(schema, modules)
  batchWorker.register(t)
  mcp.register(t)
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
  const [me, other] = await t.run(async (ctx) => [
    await ctx.db.insert("users", { name: "Sam" }),
    await ctx.db.insert("users", { name: "Alex" }),
  ])
  const addApplication = (userId: Id<"users">, company: string, extra: object = {}) =>
    t.run((ctx) =>
      ctx.db.insert("applications", {
        userId,
        company,
        role: "Engineer",
        status: "applied",
        number: 1,
        history: [],
        ...extra,
      })
    )
  const finish = () => t.finishAllScheduledFunctions(vi.runAllTimers)
  return { t, me: me!, other: other!, addApplication, finish }
}

describe("deleting an account", () => {
  it("clears every table past one batch, and only that person's", async () => {
    const { t, me, other, addApplication, finish } = await setup()
    for (let i = 0; i < 205; i++) await addApplication(me, `Co ${i}`)
    const theirs = await addApplication(other, "Theirs")
    vi.advanceTimersByTime(1000)
    await t.run(async (ctx) => {
      await ctx.db.insert("goals", {
        userId: me,
        name: "Mine",
        summary: "",
        priority: "none",
        start: "2026-01-01",
        target: "2026-02-01",
        milestones: [],
      } as never)
      await ctx.db.insert("activityEvents", {
        userId: me,
        work: "w",
        at: 1,
        failed: false,
        outcome: "done",
      })
      await ctx.db.insert("applicationSends", { userId: me, applicationId: theirs, at: 1 })
    })
    vi.advanceTimersByTime(1000)
    await t.run((ctx) => startDelete(ctx, { kind: "account", userId: me, before: Date.now() }))
    await finish()
    const left = await t.run(async (ctx) => ({
      applications: await ctx.db.query("applications").collect(),
      goals: await ctx.db.query("goals").collect(),
      activity: await ctx.db.query("activityEvents").collect(),
      sends: await ctx.db.query("applicationSends").collect(),
      jobs: await ctx.db.query("deleteJobs").collect(),
    }))
    expect(left.applications.map((a) => a._id)).toEqual([theirs])
    expect(left.goals).toEqual([])
    expect(left.activity).toEqual([])
    expect(left.sends).toEqual([])
    expect(left.jobs).toEqual([])
  })

  it("leaves what's added after the delete was asked for", async () => {
    const { t, me, addApplication, finish } = await setup()
    await addApplication(me, "Old")
    vi.advanceTimersByTime(1000)
    const before = Date.now()
    await t.run((ctx) => startDelete(ctx, { kind: "account", userId: me, before }))
    vi.advanceTimersByTime(1000)
    const added = await addApplication(me, "New")
    await finish()
    const left = await t.run((ctx) => ctx.db.query("applications").collect())
    expect(left.map((a) => a._id)).toEqual([added])
  })
})

describe("deleteAccount", () => {
  it("empties the profile at once, and the rest moments later", async () => {
    const { t, me, addApplication, finish } = await setup()
    username.registerUsername(t)
    await addApplication(me, "Mine")
    const agents = () => t.run((ctx) => ctx.runQuery(components.mcp.grants.list, { userId: me }))
    await t.run((ctx) =>
      ctx.runMutation(components.mcp.grants.createApiKey, {
        userId: me,
        name: "Agent",
        scopes: [],
        resource: "https://test.convex.site/mcp",
        hash: "hash",
      })
    )
    expect(await agents()).toHaveLength(1)
    vi.advanceTimersByTime(1000)
    await t.withIdentity({ subject: me }).mutation(api.api.users.deleteAccount, {})
    expect((await t.run((ctx) => ctx.db.get("users", me)))?.name).toBeUndefined()
    expect(await agents()).toEqual([])
    // A code approved just before can still turn into a connection after that.
    await t.run((ctx) =>
      ctx.runMutation(components.mcp.grants.createApiKey, {
        userId: me,
        name: "Late",
        scopes: [],
        resource: "https://test.convex.site/mcp",
        hash: "late",
      })
    )
    expect(await agents()).toHaveLength(1)
    await finish()
    expect(await t.run((ctx) => ctx.db.query("applications").collect())).toEqual([])
    vi.advanceTimersByTime(3 * 60 * 1000)
    await t.finishAllScheduledFunctions(vi.runAllTimers)
    expect(await agents()).toEqual([])
  })
})

describe("the Trash", () => {
  it("leaves one restored after emptying was asked for", async () => {
    const { t, me, addApplication, finish } = await setup()
    const asMe = t.withIdentity({ subject: me })
    const trashed = { trashedAt: 1 }
    const goes = await addApplication(me, "Goes", trashed)
    const stays = await addApplication(me, "Stays", trashed)
    await asMe.mutation(api.api.applications.emptyTrash, {})
    await asMe.mutation(api.api.applications.restore, { id: stays })
    await finish()
    expect(await t.run((ctx) => ctx.db.get("applications", goes))).toBeNull()
    expect(await t.run((ctx) => ctx.db.get("applications", stays))).not.toBeNull()
  })

  it("empties only that person's", async () => {
    const { t, me, other, addApplication, finish } = await setup()
    const mine = await addApplication(me, "Mine", { trashedAt: 1 })
    const theirs = await addApplication(other, "Theirs", { trashedAt: 1 })
    await t.withIdentity({ subject: me }).mutation(api.api.applications.emptyTrash, {})
    await finish()
    expect(await t.run((ctx) => ctx.db.get("applications", mine))).toBeNull()
    expect(await t.run((ctx) => ctx.db.get("applications", theirs))).not.toBeNull()
  })

  it("keeps one given longer after the sweep found it due", async () => {
    const { t, me, addApplication, finish } = await setup()
    const now = Date.now()
    const due = await addApplication(me, "Due", { trashedAt: 1, purgeAt: now - day })
    const given = await addApplication(me, "Given", { trashedAt: 1, purgeAt: now - day })
    await t.mutation(internal.api.applications.sweep, {})
    await t.run((ctx) => ctx.db.patch("applications", given, { purgeAt: now + day }))
    await finish()
    expect(await t.run((ctx) => ctx.db.get("applications", due))).toBeNull()
    expect(await t.run((ctx) => ctx.db.get("applications", given))).not.toBeNull()
  })
})

describe("the worker", () => {
  it("runs jobs one after another, and goes idle", async () => {
    const { t, me, other, addApplication, finish } = await setup()
    await addApplication(me, "Mine", { trashedAt: 1 })
    await addApplication(other, "Theirs", { trashedAt: 1 })
    await t.withIdentity({ subject: me }).mutation(api.api.applications.emptyTrash, {})
    await t.withIdentity({ subject: other }).mutation(api.api.applications.emptyTrash, {})
    await finish()
    const left = await t.run(async (ctx) => [
      ...(await ctx.db.query("applications").collect()),
      ...(await ctx.db.query("deleteJobs").collect()),
    ])
    expect(left).toEqual([])
  })

  it("nudges the worker only when a job has waited too long", async () => {
    const { t, me, finish } = await setup()
    await t.mutation(internal.api.deletes.restartIfStuck, {})
    await t.run((ctx) => startDelete(ctx, { kind: "trash", userId: me, before: Date.now() }))
    vi.advanceTimersByTime(20 * 60 * 1000)
    await t.mutation(internal.api.deletes.restartIfStuck, {})
    await finish()
    expect(await t.run((ctx) => ctx.db.query("deleteJobs").collect())).toEqual([])
  })
})
