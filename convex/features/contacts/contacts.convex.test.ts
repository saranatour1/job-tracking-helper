// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import rateLimiter from "@convex-dev/rate-limiter/test"
import workpool from "@convex-dev/workpool/test"
import { convexTest } from "convex-test"
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test"

import { api, components, internal } from "../../_generated/api"
import cloudflareSchema from "../../components/cloudflareEmail/schema"
import notificationsSchema from "../../components/notifications/schema"
import { seal } from "../../lib/secrets"
import schema from "../../schema"
import { byCompany } from "./rules"
import { deleteApplication } from "../applications/utils"
import { aad, keys } from "../email/utils"

const everyone = { paginationOpts: { numItems: 100, cursor: null } }

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
afterEach(() => void vi.useRealTimers())

const setup = async () => {
  const t = convexTest(schema, modules)
  rateLimiter.register(t as never)
  workpool.register(t as never, "applyPool")
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
  const k = await keys()
  const { userId, hooli } = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { name: "Sam", email: "sam@example.com" })
    await ctx.db.insert("emailConnections", {
      userId,
      details: await seal(
        k,
        JSON.stringify({ accountId: "a", fromAddress: "jobs@example.com" }),
        aad.details(userId)
      ),
      token: await seal(k, "token", aad.token(userId)),
      tokenAddedAt: 1,
      access: { workers: true, routing: true },
      allow: { send: true, setup: true, receive: true, read: false },
    })
    const hooli = await ctx.db.insert("applications", {
      userId,
      company: "Hooli",
      role: "Engineer",
      status: "applied",
      number: 1,
      history: [],
    })
    return { userId, hooli }
  })
  // An email arriving and being sorted, then what's scheduled after it.
  const receive = async (mail: object) => {
    const emailId: string = await t.run(async (ctx) =>
      ctx.runMutation(components.cloudflareEmail.lib.receive, {
        owner: userId,
        payload: await seal(
          k,
          JSON.stringify({ subject: "Hello from Hooli", to: [], attachments: [], ...mail }),
          aad.email(userId)
        ),
      })
    )
    await t.action(internal.api.email.sortMail, { userId, emailId })
    await t.finishAllScheduledFunctions(vi.runAllTimers)
  }
  return { t, as: t.withIdentity({ subject: userId }), userId, hooli, receive }
}

describe("learning contacts from mail", () => {
  it("adds who wrote, counts them once each email, and leaves out automated senders", async () => {
    const { as, hooli, receive } = await setup()
    await receive({ from: "Pat@hooli.com", fromName: "Pat Lee" })
    await receive({ from: "pat@hooli.com", fromName: "Pat Lee" })
    await receive({ from: "no-reply@hooli.com" })
    const list = (await as.query(api.api.contacts.list, everyone)).page
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({
      company: "Hooli",
      name: "Pat Lee",
      email: "pat@hooli.com",
      count: 2,
      applicationId: hooli,
    })
  })

  it("lists the one with the most email first within a company", async () => {
    const { as, receive } = await setup()
    await receive({ from: "sam@hooli.com", fromName: "Sam" })
    await receive({ from: "pat@hooli.com", fromName: "Pat" })
    await receive({ from: "pat@hooli.com", fromName: "Pat" })
    expect(
      byCompany((await as.query(api.api.contacts.list, everyone)).page).map((c) => c.name)
    ).toEqual(["Pat", "Sam"])
  })

  it("keeps your edits when more mail arrives, and still counts it", async () => {
    const { as, receive } = await setup()
    await receive({ from: "pat@hooli.com", fromName: "Pat" })
    const [pat] = (await as.query(api.api.contacts.list, everyone)).page
    await as.action(api.api.contacts.save, {
      id: pat!.id,
      company: "Hooli",
      name: "Patricia Lee",
      email: "pat@hooli.com",
      title: "Recruiter",
      phone: "+1 555 0100",
      notes: "Prefers mornings",
    })
    await receive({ from: "pat@hooli.com", fromName: "Pat" })
    expect((await as.query(api.api.contacts.list, everyone)).page[0]).toMatchObject({
      name: "Patricia Lee",
      title: "Recruiter",
      count: 2,
    })
  })

  it("knows who's a contact, whatever the case, and not one you removed", async () => {
    const { as, receive } = await setup()
    expect(await as.query(api.api.contacts.known, { email: "pat@hooli.com" })).toBe(false)
    await receive({ from: "pat@hooli.com" })
    expect(await as.query(api.api.contacts.known, { email: "PAT@hooli.com" })).toBe(true)
    const [pat] = (await as.query(api.api.contacts.list, everyone)).page
    await as.mutation(api.api.contacts.remove, { id: pat!.id })
    expect(await as.query(api.api.contacts.known, { email: "pat@hooli.com" })).toBe(false)
  })

  it("doesn't bring back someone you removed", async () => {
    const { as, receive } = await setup()
    await receive({ from: "pat@hooli.com" })
    const [pat] = (await as.query(api.api.contacts.list, everyone)).page
    await as.mutation(api.api.contacts.remove, { id: pat!.id })
    await receive({ from: "pat@hooli.com" })
    expect((await as.query(api.api.contacts.list, everyone)).page).toEqual([])
  })
})

describe("listing", () => {
  it("comes a page at a time, and every contact turns up once", async () => {
    const { as, receive } = await setup()
    for (const name of ["ann", "bea", "cam"]) await receive({ from: `${name}@hooli.com` })
    const args = { numItems: 2, cursor: null }
    const first = await as.query(api.api.contacts.list, { paginationOpts: args })
    expect(first.page).toHaveLength(2)
    expect(first.isDone).toBe(false)
    const second = await as.query(api.api.contacts.list, {
      paginationOpts: { numItems: 2, cursor: first.continueCursor },
    })
    expect(new Set([...first.page, ...second.page].map((c) => c.email))).toEqual(
      new Set(["ann@hooli.com", "bea@hooli.com", "cam@hooli.com"])
    )
  })
})

describe("your own contacts", () => {
  const blank = { company: "Hooli", name: "", email: "", title: "", phone: "", notes: "" }

  it("adds one, and refuses an empty one or a second with the same address", async () => {
    const { as } = await setup()
    await expect(as.action(api.api.contacts.save, blank)).rejects.toThrow("name or an email")
    await as.action(api.api.contacts.save, { ...blank, email: "Pat@hooli.com" })
    await expect(
      as.action(api.api.contacts.save, { ...blank, email: "pat@hooli.com" })
    ).rejects.toThrow("already have")
    expect((await as.query(api.api.contacts.list, everyone)).page[0]?.email).toBe("pat@hooli.com")
  })

  it("learns from mail you file by hand", async () => {
    const { t, as, hooli, receive } = await setup()
    await receive({ from: "stranger@elsewhere.org", subject: "Nothing to match" })
    expect((await as.query(api.api.contacts.list, everyone)).page).toEqual([])
    const [line] = await as.query(api.api.email.timeline, {})
    await as.mutation(api.api.email.assign, { eventId: line!.id, applicationId: hooli })
    await t.finishAllScheduledFunctions(vi.runAllTimers)
    expect((await as.query(api.api.contacts.list, everyone)).page.map((c) => c.email)).toEqual([
      "stranger@elsewhere.org",
    ])
  })

  it("lets you add back an address you removed", async () => {
    const { as, receive } = await setup()
    await receive({ from: "pat@hooli.com" })
    const [pat] = (await as.query(api.api.contacts.list, everyone)).page
    await as.mutation(api.api.contacts.remove, { id: pat!.id })
    await as.action(api.api.contacts.save, { ...blank, email: "pat@hooli.com", name: "Pat" })
    expect((await as.query(api.api.contacts.list, everyone)).page[0]?.name).toBe("Pat")
  })

  it("keeps a contact when its application is deleted, unlinked", async () => {
    const { t, as, hooli, receive } = await setup()
    await receive({ from: "pat@hooli.com" })
    await t.run(async (ctx) => {
      await deleteApplication(ctx, (await ctx.db.get("applications", hooli))!)
    })
    const [pat] = (await as.query(api.api.contacts.list, everyone)).page
    expect(pat?.company).toBe("Hooli")
    expect(pat?.applicationId).toBeUndefined()
  })

  it("keeps one person's contacts from another", async () => {
    const { t, as, receive } = await setup()
    await receive({ from: "pat@hooli.com" })
    const [pat] = (await as.query(api.api.contacts.list, everyone)).page
    const other = t.withIdentity({
      subject: await t.run((ctx) => ctx.db.insert("users", { name: "Other" })),
    })
    expect((await other.query(api.api.contacts.list, everyone)).page).toEqual([])
    await expect(other.mutation(api.api.contacts.remove, { id: pat!.id })).rejects.toThrow(
      "isn't yours"
    )
    await expect(
      other.action(api.api.contacts.save, { ...blank, id: pat!.id, name: "Mine" })
    ).rejects.toThrow("isn't here")
  })
})
