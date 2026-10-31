// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { convexTest } from "convex-test"
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test"

import { api, internal } from "../../_generated/api"
import schema from "../../schema"

const modules = import.meta.glob([
  "../../**/*.ts",
  "!../../components/notifications/**",
  "!../../components/cloudflareEmail/**",
  "!../../**/*.test.ts",
])

const day = 24 * 60 * 60 * 1000

const setup = async () => {
  const t = convexTest(schema, modules)
  const userId = await t.run((ctx) => ctx.db.insert("users", { name: "Sam" }))
  const as = t.withIdentity({ subject: userId })
  const add = (company: string) =>
    t.run((ctx) =>
      ctx.db.insert("applications", {
        number: 1,
        history: [],
        userId,
        role: "Engineer",
        company,
        status: "applied",
        priority: "none",
        labels: [],
        method: "Company site",
        location: "",
        description: "",
      } as never)
    )
  return { t, as, userId, add }
}

describe("archive and trash", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(Date.parse("2026-10-01T00:00:00Z"))
  })
  afterEach(() => vi.useRealTimers())

  it("keeps archived ones listed and marked, and trashed ones out of the list", async () => {
    const { as, add } = await setup()
    const [a, b, c] = [await add("Acme"), await add("Hooli"), await add("Initech")]
    await as.mutation(api.applications.archive, { id: a, archived: true })
    await as.mutation(api.applications.trash, { id: b })
    const list = await as.query(api.applications.list, {})
    expect(list.map((x) => [x.company, x.archivedAt !== undefined])).toEqual([
      ["Acme", true],
      ["Initech", false],
    ])
    expect((await as.query(api.applications.trashed, {})).map((x) => x.company)).toEqual(["Hooli"])
    await as.mutation(api.applications.restore, { id: b })
    expect(await as.query(api.applications.trashed, {})).toEqual([])
    expect((await as.query(api.applications.list, {})).map((x) => x._id)).toContain(c)
  })

  it("deletes for good only from the Trash, and unlinks what pointed at it", async () => {
    const { t, as, userId, add } = await setup()
    const id = await add("Acme")
    const leadId = await t.run((ctx) =>
      ctx.db.insert("jobLeads", {
        userId,
        applicationId: id,
        url: "https://acme.dev/jobs/1",
        urlKey: "acme.dev/jobs/1",
        title: "Engineer",
        company: "Acme",
        snippet: "",
        fit: 80,
        reasons: [],
        status: "applied",
      })
    )
    await expect(as.mutation(api.applications.deleteForever, { id })).rejects.toThrow(
      "Move it to the Trash before deleting it."
    )
    await as.mutation(api.applications.trash, { id })
    await as.mutation(api.applications.deleteForever, { id })
    expect(await t.run((ctx) => ctx.db.get("applications", id))).toBeNull()
    // The lead stays tracked, so loops won't offer the role again.
    const lead = await t.run((ctx) => ctx.db.get("jobLeads", leadId))
    expect(lead).toMatchObject({ status: "applied" })
    expect(lead?.applicationId).toBeUndefined()
  })

  it("sweeps archived ones to the Trash after 30 days, and empties the Trash on time", async () => {
    const { t, as, add } = await setup()
    const archived = await add("Acme")
    const trashed = await add("Hooli")
    await as.mutation(api.applications.archive, { id: archived, archived: true })
    await as.mutation(api.applications.trash, { id: trashed })

    vi.setSystemTime(Date.now() + 31 * day)
    expect(await t.mutation(internal.applications.sweep, {})).toEqual({ trashed: 1, deleted: 0 })
    expect((await as.query(api.applications.trashed, {})).map((x) => x.company)).toEqual([
      "Acme",
      "Hooli",
    ])

    // 90 days by default: Hooli, trashed first, goes; Acme, trashed 31 days later, stays.
    vi.setSystemTime(Date.now() + 60 * day)
    expect(await t.mutation(internal.applications.sweep, {})).toEqual({ trashed: 0, deleted: 1 })
    expect((await as.query(api.applications.trashed, {})).map((x) => x.company)).toEqual(["Acme"])
  })

  it("keeps the Trash when set to never, and takes only the offered choices", async () => {
    const { t, as, add } = await setup()
    const id = await add("Acme")
    await as.mutation(api.applications.trash, { id })
    await as.mutation(api.applications.setTrashDays, { days: 0 })
    vi.setSystemTime(Date.now() + 400 * day)
    expect(await t.mutation(internal.applications.sweep, {})).toEqual({ trashed: 0, deleted: 0 })
    await expect(as.mutation(api.applications.setTrashDays, { days: 7 })).rejects.toThrow(
      "Pick one of the choices."
    )
  })

  it("takes an archived one out of the Archive when it's trashed", async () => {
    const { t, as, add } = await setup()
    const id = await add("Acme")
    await as.mutation(api.applications.archive, { id, archived: true })
    await as.mutation(api.applications.trash, { id })
    const doc = await t.run((ctx) => ctx.db.get("applications", id))
    expect(doc?.archivedAt).toBeUndefined()
    expect(doc!.purgeAt! - doc!.trashedAt!).toBe(90 * day)
    await expect(as.mutation(api.applications.setStatus, { id, status: "offer" })).rejects.toThrow(
      "That application is in the Trash."
    )
  })

  it("moves what's in the Trash to a new date when the setting changes", async () => {
    const { t, as, add } = await setup()
    const id = await add("Acme")
    await as.mutation(api.applications.trash, { id })
    await as.mutation(api.applications.setTrashDays, { days: 30 })
    vi.setSystemTime(Date.now() + 31 * day)
    expect(await t.mutation(internal.applications.sweep, {})).toEqual({ trashed: 0, deleted: 1 })
  })

  it("deletes one person's due Trash whatever others keep", async () => {
    const { t, as, add } = await setup()
    const other = await t.run((ctx) => ctx.db.insert("users", { name: "Alex", trashDays: 0 }))
    const theirs = await t.run((ctx) =>
      ctx.db.insert("applications", {
        number: 1,
        history: [],
        userId: other,
        role: "Engineer",
        company: "Kept",
        status: "applied",
        priority: "none",
        labels: [],
        method: "Company site",
        location: "",
        description: "",
        trashedAt: Date.now(),
      } as never)
    )
    const mine = await add("Acme")
    await as.mutation(api.applications.trash, { id: mine })
    vi.setSystemTime(Date.now() + 100 * day)
    await t.mutation(internal.applications.sweep, {})
    expect(await t.run((ctx) => ctx.db.get("applications", mine))).toBeNull()
    expect(await t.run((ctx) => ctx.db.get("applications", theirs))).not.toBeNull()
  })

  it("empties a big Trash in batches", async () => {
    const { t, as, add } = await setup()
    for (let i = 0; i < 30; i++)
      await as.mutation(api.applications.trash, { id: await add(`Co ${i}`) })
    expect(await as.mutation(api.applications.emptyTrash, {})).toBe(30)
    await t.finishAllScheduledFunctions(vi.runAllTimers)
    expect(await as.query(api.applications.trashed, {})).toEqual([])
  })

  it("won't touch someone else's application", async () => {
    const { t, add } = await setup()
    const id = await add("Acme")
    const other = await t.run((ctx) => ctx.db.insert("users", { name: "Alex" }))
    await expect(
      t.withIdentity({ subject: other }).mutation(api.applications.trash, { id })
    ).rejects.toThrow("That application isn't yours.")
  })
})
