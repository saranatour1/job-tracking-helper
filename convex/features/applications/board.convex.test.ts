// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { convexTest } from "convex-test"
import { describe, expect, it } from "vite-plus/test"

import { api, internal } from "../../_generated/api"
import type { Id } from "../../_generated/dataModel"
import schema from "../../schema"
import { maxApplications, statuses } from "./validators"

const modules = import.meta.glob([
  "../../**/*.ts",
  "!../../components/notifications/**",
  "!../../components/cloudflareEmail/**",
  "!../../**/*.test.ts",
])

const setup = async () => {
  const t = convexTest(schema, modules)
  const userId = await t.run((ctx) => ctx.db.insert("users", { name: "Sam" }))
  return { t, userId, as: t.withIdentity({ subject: userId }) }
}

const row = (userId: Id<"users">, number: number) => ({
  userId,
  number,
  company: `Company ${number % 7}`,
  role: "Engineer",
  status: statuses[number % statuses.length]!,
  labels: number % 2 ? ["Remote"] : [],
  priority: "high" as const,
  history: [{ status: "applied" as const, at: 1 }],
  description: "x".repeat(5000),
  notes: [{ text: "n".repeat(5000), at: number }],
})

const lead = (userId: Id<"users">, n: number) => ({
  userId,
  url: `https://example.com/${n}`,
  urlKey: `example.com/${n}`,
  title: "Engineer",
  company: "Hooli",
  snippet: "",
  fit: 80,
  reasons: [],
  status: "new" as const,
  verdict: "notFit" as const,
})

describe("the board's rows", () => {
  it("has what filters, groups and counts need for every row, without the long fields", async () => {
    const { t, userId, as } = await setup()
    await t.run(async (ctx) => {
      for (let n = 1; n <= maxApplications; n++) await ctx.db.insert("applications", row(userId, n))
    })
    const cards = await as.query(api.api.applications.list, {})
    expect(cards).toHaveLength(maxApplications)
    // Each status has its share, so its column's count is right at the limit.
    for (const status of statuses) {
      const expected = Array.from({ length: maxApplications }, (_, i) => i + 1).filter(
        (n) => statuses[n % statuses.length] === status
      ).length
      expect(cards.filter((c) => c.status === status)).toHaveLength(expected)
    }
    expect(cards.filter((c) => c.labels?.includes("Remote"))).toHaveLength(maxApplications / 2)
    expect(new Set(cards.map((c) => c.company)).size).toBe(7)
    const [card] = cards
    expect(card).not.toHaveProperty("description")
    expect(card).not.toHaveProperty("notes")
    expect(card).toMatchObject({ number: 1, priority: "high", lastNoteAt: 1 })
    expect(JSON.stringify(cards).length).toBeLessThan(maxApplications * 400)
  })

  it("keeps the newest past the limit, while a link still opens an older one", async () => {
    const { t, userId, as } = await setup()
    await t.run(async (ctx) => {
      for (let n = 1; n <= maxApplications + 1; n++)
        await ctx.db.insert("applications", { ...row(userId, n), description: "", notes: [] })
    })
    const cards = await as.query(api.api.applications.list, {})
    expect(cards).toHaveLength(maxApplications)
    expect(cards.some((c) => c.number === 1)).toBe(false)
    const oldest = await as.query(api.api.applications.get, { ref: "app-1" })
    expect(oldest?.number).toBe(1)
    expect(await as.query(api.api.applications.numberOf, { id: oldest!._id })).toBe(1)
  })
})

describe("opening one application", () => {
  it("comes whole, by its text or by its id", async () => {
    const { t, userId, as } = await setup()
    const id = await t.run((ctx) => ctx.db.insert("applications", row(userId, 12)))
    const whole = await as.query(api.api.applications.get, { ref: "app-12" })
    expect(whole).toMatchObject({ _id: id, description: "x".repeat(5000) })
    expect(whole?.notes).toHaveLength(1)
    expect((await as.query(api.api.applications.get, { ref: id }))?._id).toBe(id)
  })

  it("finds nothing that's trashed, someone else's, or not a reference at all", async () => {
    const { t, userId, as } = await setup()
    const id = await t.run((ctx) => ctx.db.insert("applications", row(userId, 3)))
    const other = t.withIdentity({
      subject: await t.run((ctx) => ctx.db.insert("users", { name: "Ada" })),
    })
    expect(await other.query(api.api.applications.get, { ref: "app-3" })).toBeNull()
    expect(await other.query(api.api.applications.get, { ref: id })).toBeNull()
    expect(await other.query(api.api.applications.numberOf, { id })).toBeNull()
    expect(await as.query(api.api.applications.get, { ref: "nonsense" })).toBeNull()
    await as.mutation(api.api.applications.trash, { id })
    expect(await as.query(api.api.applications.get, { ref: "app-3" })).toBeNull()
  })
})

describe("fit on the board", () => {
  it("comes with the row when a job is tracked or attached, verdict and all", async () => {
    const { t, userId, as } = await setup()
    const leadId = await t.run((ctx) => ctx.db.insert("jobLeads", lead(userId, 1)))
    await as.mutation(api.api.loops.track, { leadId })
    const [tracked] = await as.query(api.api.applications.list, {})
    expect(tracked).toMatchObject({ fit: 80, isFit: false })

    const applicationId = await t.run((ctx) => ctx.db.insert("applications", row(userId, 9)))
    const known = await t.run((ctx) => ctx.db.insert("jobLeads", lead(userId, 2)))
    await t.mutation(internal.api.loops.attachLead, { leadId: known, applicationId })
    expect(await t.run((ctx) => ctx.db.get("applications", applicationId))).toMatchObject({
      fit: 80,
      isFit: false,
    })
  })

  it("is on every row past the old limit of 1,000 leads", async () => {
    const { t, userId, as } = await setup()
    await t.run(async (ctx) => {
      for (let n = 1; n <= 1001; n++) {
        const leadId = await ctx.db.insert("jobLeads", lead(userId, n))
        const applicationId = await ctx.db.insert("applications", {
          ...row(userId, n),
          description: "",
          notes: [],
        })
        await ctx.db.patch("jobLeads", leadId, { applicationId })
      }
    })
    await t.mutation(internal.api.migrations.fillBoardFields, {})
    await t.finishAllScheduledFunctions(() => undefined)
    const cards = await as.query(api.api.applications.list, {})
    expect(cards.filter((c) => c.fit === 80 && c.isFit === false)).toHaveLength(1001)
  })
})

describe("the fill for existing applications", () => {
  it("isn't done while the only mail left is newer than a trashed email", async () => {
    const { t, userId } = await setup()
    await t.run(async (ctx) => {
      const id = await ctx.db.insert("applications", row(userId, 1))
      const mail = {
        userId,
        applicationId: id,
        note: "sealed",
        by: "rules" as const,
        box: "inbox" as const,
      }
      await ctx.db.insert("mailEvents", {
        ...mail,
        emailId: "a",
        kind: "other",
        at: 1,
        box: "trash",
      })
      await ctx.db.insert("mailEvents", { ...mail, emailId: "b", kind: "other", at: 2 })
    })
    expect(await t.query(internal.api.migrations.boardFieldsLeft, {})).toBe(1)
    await t.mutation(internal.api.migrations.fillBoardFields, {})
    expect(await t.query(internal.api.migrations.boardFieldsLeft, {})).toBe(0)
  })

  it("leaves a fit that's already there when run again", async () => {
    const { t, userId } = await setup()
    const id = await t.run(async (ctx) => {
      const id = await ctx.db.insert("applications", { ...row(userId, 1), fit: 95, isFit: true })
      await ctx.db.insert("jobLeads", { ...lead(userId, 1), applicationId: id })
      return id
    })
    await t.mutation(internal.api.migrations.fillBoardFields, {})
    expect(await t.run((ctx) => ctx.db.get("applications", id))).toMatchObject({
      fit: 95,
      isFit: true,
    })
  })

  it("gives each its mail summary and counts the catalog", async () => {
    const { t, userId } = await setup()
    const id = await t.run(async (ctx) => {
      const id = await ctx.db.insert("applications", row(userId, 1))
      const mail = {
        userId,
        applicationId: id,
        note: "sealed",
        by: "rules" as const,
        box: "inbox" as const,
      }
      await ctx.db.insert("mailEvents", { ...mail, emailId: "a", kind: "other", at: 1 })
      await ctx.db.insert("mailEvents", { ...mail, emailId: "b", kind: "offer", at: 2 })
      await ctx.db.insert("mailEvents", {
        ...mail,
        emailId: "c",
        kind: "rejection",
        at: 3,
        box: "trash",
      })
      await ctx.db.insert("jobBoards", {
        kind: "greenhouse",
        slug: "hooli",
        company: "Hooli",
        addedAt: 0,
        jobs: 4,
      })
      return id
    })
    expect(await t.query(internal.api.migrations.boardFieldsLeft, {})).toBe(1)
    await t.mutation(internal.api.migrations.fillBoardFields, {})
    expect(await t.query(internal.api.migrations.boardFieldsLeft, {})).toBe(0)
    expect((await t.run((ctx) => ctx.db.get("applications", id)))?.mail).toEqual({
      count: 2,
      at: 2,
      kind: "offer",
    })
    expect(await t.run((ctx) => ctx.db.query("jobCatalog").first())).toMatchObject({
      boards: 1,
    })
  })
})
