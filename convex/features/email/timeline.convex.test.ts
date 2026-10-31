// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { convexTest } from "convex-test"
import { describe, expect, it, vi } from "vite-plus/test"

import { api } from "../../_generated/api"
import type { Id } from "../../_generated/dataModel"
import { seal } from "../../lib/secrets"
import schema from "../../schema"
import { aad, keys, syncMailSummary } from "./utils"
import { maxUnsortedCount } from "./validators"

const modules = import.meta.glob([
  "../../**/*.ts",
  "!../../components/notifications/**",
  "!../../components/cloudflareEmail/**",
  "!../../**/*.test.ts",
])

const setup = async () => {
  vi.stubEnv("SECRETS_KEYS", `v1:${btoa(String.fromCharCode(...new Uint8Array(32).fill(7)))}`)
  const t = convexTest(schema, modules)
  const userId = await t.run((ctx) => ctx.db.insert("users", { name: "Sam" }))
  const k = await keys()
  const note = (fields: object = {}) =>
    seal(k, JSON.stringify({ from: "a", subject: "s", ...fields }), aad.email(userId))
  return { t, userId, note, as: t.withIdentity({ subject: userId }) }
}

const applicationOf = (userId: Id<"users">) => ({
  userId,
  company: "Hooli",
  role: "Engineer",
  status: "applied" as const,
  number: 1,
  history: [],
})

const first = { numItems: 25, cursor: null }

describe("the mail timeline", () => {
  it("keeps the newest mail past its limit, wherever it was filed", async () => {
    vi.stubEnv("SECRETS_KEYS", `v1:${btoa(String.fromCharCode(...new Uint8Array(32).fill(7)))}`)
    const t = convexTest(schema, modules)
    const userId = await t.run((ctx) => ctx.db.insert("users", { name: "Sam" }))
    const k = await keys()
    const note = await seal(k, JSON.stringify({ from: "a", subject: "s" }), aad.email(userId))
    await t.run(async (ctx) => {
      const applicationId = await ctx.db.insert("applications", {
        userId,
        company: "Hooli",
        role: "Engineer",
        status: "applied",
        number: 1,
        history: [],
      })
      for (let at = 0; at < 301; at++)
        await ctx.db.insert("mailEvents", {
          userId,
          emailId: `e${at}`,
          kind: "other",
          note,
          at,
          by: "rules",
          box: "inbox",
        })
      await ctx.db.insert("mailEvents", {
        userId,
        emailId: "newest",
        applicationId,
        kind: "other",
        note,
        at: 1000,
        by: "rules",
        box: "inbox",
      })
    })
    const events = await t.withIdentity({ subject: userId }).query(api.api.email.timeline, {})
    expect(events).toHaveLength(300)
    expect(events[0]?.at).toBe(1000)
  })

  it("between two times, takes what's in them and interview slots from older mail", async () => {
    const { t, userId, note, as } = await setup()
    const day = 24 * 60 * 60 * 1000
    const mail = { userId, by: "rules" as const, box: "inbox" as const, kind: "other" as const }
    await t.run(async (ctx) => {
      await ctx.db.insert("mailEvents", { ...mail, emailId: "old", note: await note(), at: 1 })
      await ctx.db.insert("mailEvents", {
        ...mail,
        emailId: "in",
        note: await note(),
        at: 100 * day,
      })
      await ctx.db.insert("mailEvents", {
        ...mail,
        emailId: "later",
        note: await note(),
        at: 300 * day,
      })
      await ctx.db.insert("mailEvents", {
        ...mail,
        emailId: "slot in range",
        kind: "interview",
        note: await note({ slot: 110 * day }),
        at: 2,
      })
      await ctx.db.insert("mailEvents", {
        ...mail,
        emailId: "slot elsewhere",
        kind: "interview",
        note: await note({ slot: 500 * day }),
        at: 3,
      })
      await ctx.db.insert("mailEvents", {
        ...mail,
        emailId: "binned slot",
        kind: "interview",
        note: await note({ slot: 110 * day }),
        at: 4,
        box: "trash",
      })
    })
    const lines = await as.query(api.api.email.timeline, { from: 90 * day, to: 120 * day })
    expect(lines.map((l) => l.at)).toEqual([100 * day, 2])
    expect(lines[1]?.slot).toBe(110 * day)
  })
})

describe("an application's mail", () => {
  it("pages past the old limit of 300, newest first and each one once", async () => {
    const { t, userId, note, as } = await setup()
    const sealed = await note()
    const applicationId = await t.run(async (ctx) => {
      const applicationId = await ctx.db.insert("applications", applicationOf(userId))
      for (let at = 1; at <= 301; at++)
        await ctx.db.insert("mailEvents", {
          userId,
          applicationId,
          emailId: `e${at}`,
          kind: "other",
          note: sealed,
          at,
          by: "rules",
          box: "inbox",
        })
      await syncMailSummary(ctx, applicationId)
      return applicationId
    })
    const seen: number[] = []
    let cursor: string | null = null
    let isDone = false
    while (!isDone) {
      const page: { page: { at: number }[]; isDone: boolean; continueCursor: string } =
        await as.query(api.api.email.forApplication, {
          applicationId,
          paginationOpts: { numItems: 100, cursor },
        })
      seen.push(...page.page.map((l) => l.at))
      cursor = page.continueCursor
      isDone = page.isDone
    }
    expect(seen).toEqual(Array.from({ length: 301 }, (_, i) => 301 - i))
    // The card's count doesn't depend on any of that being loaded.
    expect((await t.run((ctx) => ctx.db.get("applications", applicationId)))?.mail).toEqual({
      count: 301,
      at: 301,
      kind: "other",
    })
  })

  it("is only its owner's", async () => {
    const { t, userId, note } = await setup()
    const sealed = await note()
    const applicationId = await t.run(async (ctx) => {
      const applicationId = await ctx.db.insert("applications", applicationOf(userId))
      await ctx.db.insert("mailEvents", {
        userId,
        applicationId,
        emailId: "e",
        kind: "other",
        note: sealed,
        at: 1,
        by: "rules",
        box: "inbox",
      })
      return applicationId
    })
    const other = t.withIdentity({
      subject: await t.run((ctx) => ctx.db.insert("users", { name: "Ada" })),
    })
    const { page } = await other.query(api.api.email.forApplication, {
      applicationId,
      paginationOpts: first,
    })
    expect(page).toEqual([])
  })
})

describe("unsorted mail", () => {
  it("counts up to its cap, leaves out the Trash and what's filed, and pages", async () => {
    const { t, userId, note, as } = await setup()
    const sealed = await note()
    await t.run(async (ctx) => {
      const applicationId = await ctx.db.insert("applications", applicationOf(userId))
      const mail = {
        userId,
        kind: "other" as const,
        note: sealed,
        by: "rules" as const,
        box: "inbox" as const,
      }
      for (let at = 1; at <= maxUnsortedCount + 1; at++)
        await ctx.db.insert("mailEvents", { ...mail, emailId: `e${at}`, at })
      await ctx.db.insert("mailEvents", { ...mail, emailId: "filed", at: 999, applicationId })
      await ctx.db.insert("mailEvents", { ...mail, emailId: "binned", at: 998, box: "trash" })
    })
    expect(await as.query(api.api.email.unsortedCount, {})).toBe(maxUnsortedCount)
    const { page, isDone } = await as.query(api.api.email.unsorted, { paginationOpts: first })
    expect(page.map((l) => l.at)).toEqual(
      Array.from({ length: 25 }, (_, i) => maxUnsortedCount + 1 - i)
    )
    expect(isDone).toBe(false)
  })
})
