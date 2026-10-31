// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import rateLimiter from "@convex-dev/rate-limiter/test"
import workpool from "@convex-dev/workpool/test"
import batchWorker from "@convex-dev/batch-worker/test"
import { convexTest } from "convex-test"
import { beforeEach, describe, expect, it, vi } from "vite-plus/test"

import { api, components, internal } from "../../_generated/api"
import cloudflareSchema from "../../components/cloudflareEmail/schema"
import notificationsSchema from "../../components/notifications/schema"
import { seal } from "../../lib/secrets"
import schema from "../../schema"
import { statusLabels } from "../applications/validators"
import { aad, keys } from "../email/utils"
import { activityOf } from "./utils"

const modules = import.meta.glob([
  "../../**/*.ts",
  "!../../components/notifications/**",
  "!../../components/cloudflareEmail/**",
  "!../../**/*.test.ts",
])

const fetchMock = vi.fn<typeof fetch>()

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubEnv("SECRETS_KEYS", `v1:${btoa(String.fromCharCode(...new Uint8Array(32).fill(7)))}`)
  vi.stubGlobal("fetch", fetchMock)
  fetchMock.mockReset()
  fetchMock.mockImplementation(
    async () =>
      new Response(JSON.stringify({ success: true, result: { delivered: ["a"] } }), { status: 200 })
  )
})

const first = { numItems: 25, cursor: null }

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
  const k = await keys()
  const { userId, hooli, otherId } = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { name: "Sam", email: "sam@example.com" })
    const otherId = await ctx.db.insert("users", { name: "Alex", email: "alex@example.com" })
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
    return { userId, hooli, otherId }
  })
  const as = t.withIdentity({ subject: userId })
  const events = async (failed?: boolean) =>
    (await as.query(api.api.activity.page, { ...(failed && { failed }), paginationOpts: first }))
      .page
  return { t, as, userId, otherId, hooli, events, k }
}

describe("activityOf", () => {
  it("skips work with no owner", () => {
    expect(activityOf({ work: "jobs.fetchBoard" })).toBeNull()
    expect(activityOf(null)).toBeNull()
  })

  it("marks an error level or a failed outcome as failed, with the reason", () => {
    expect(
      activityOf({ userId: "u", work: "w", level: "error", error: { message: "boom" } })
    ).toMatchObject({ failed: true, outcome: "failed", error: "boom" })
    expect(activityOf({ userId: "u", work: "w", outcome: "failed", error: "why" })).toMatchObject({
      failed: true,
      error: "why",
    })
    expect(activityOf({ userId: "u", work: "w", outcome: "done" })).toMatchObject({
      failed: false,
      outcome: "done",
    })
  })
})

describe("activity", () => {
  it("records sent mail without its subject or address", async () => {
    const { as, hooli, events } = await setup()
    await as.action(api.api.email.sendFromApplication, {
      applicationId: hooli,
      to: "pat@hooli.com",
      subject: "A private subject",
      text: "Hi",
    })
    const [event] = await events()
    expect(event).toMatchObject({
      work: "mail.send",
      failed: false,
      outcome: "sent",
      summary: "Email to Hooli",
      applicationId: hooli,
    })
    expect(JSON.stringify(event)).not.toMatch(/private subject|pat@hooli/)
  })

  it("records why mail failed, and keeps it under Failed", async () => {
    const { as, hooli, events } = await setup()
    fetchMock.mockImplementation(
      async () =>
        new Response(JSON.stringify({ success: false, errors: [{ message: "Nope" }] }), {
          status: 400,
        })
    )
    await expect(
      as.action(api.api.email.sendFromApplication, {
        applicationId: hooli,
        to: "pat@hooli.com",
        subject: "Hi",
        text: "Hi",
      })
    ).rejects.toThrow()
    const [event] = await events(true)
    expect(event).toMatchObject({ work: "mail.send", failed: true, outcome: "failed" })
    expect(event?.error).toContain("Cloudflare didn't send it")
  })

  it("records received mail, and mail it couldn't open", async () => {
    const { t, userId, events, k } = await setup()
    const receive = async (payload: string) => {
      const emailId: string = await t.run((ctx) =>
        ctx.runMutation(components.cloudflareEmail.lib.receive, { owner: userId, payload })
      )
      return t.action(internal.api.emailActions.sortMail, { userId, emailId })
    }
    await receive(
      await seal(
        k,
        JSON.stringify({
          subject: "A private subject",
          from: "pat@elsewhere.example",
          to: [],
          attachments: [],
        }),
        aad.email(userId)
      )
    )
    await t.finishAllScheduledFunctions(vi.runAllTimers)
    const [got] = await events()
    expect(got).toMatchObject({ work: "mail.received", summary: "Email waiting in Unsorted" })
    expect(JSON.stringify(got)).not.toMatch(/private subject|pat@elsewhere/)
    await expect(receive(await seal(k, "{}", "someone else"))).rejects.toThrow()
    const [failed] = await events(true)
    expect(failed).toMatchObject({ work: "mail.received", failed: true })
  })

  it("records status changes, and only shows your own", async () => {
    const { t, as, hooli, otherId, events } = await setup()
    await as.mutation(api.api.applications.setStatus, { id: hooli, status: "interviewing" })
    expect(await events()).toEqual([
      expect.objectContaining({
        work: "application.status",
        summary: `Hooli: ${statusLabels.applied} to ${statusLabels.interviewing}`,
      }),
    ])
    const other = t.withIdentity({ subject: otherId })
    expect((await other.query(api.api.activity.page, { paginationOpts: first })).page).toEqual([])
  })

  it("records what you edit, without what you wrote, and when you joined", async () => {
    const { t, as, hooli, userId, events } = await setup()
    await as.mutation(api.api.applications.addNote, { id: hooli, text: "A private note" })
    await as.mutation(api.api.applications.update, { id: hooli, role: "Lead" })
    await as.action(api.api.contacts.save, {
      company: "Hooli",
      name: "Pat Private",
      email: "pat@hooli.com",
      title: "",
      phone: "",
      notes: "",
    })
    await as.mutation(api.api.mailbox.saveTemplate, {
      name: "Private template",
      subject: "Hi",
      html: "<p>Hi</p>",
    })
    await as.mutation(api.api.users.updateProfile, { name: "Sam", email: "", userName: "" })
    const rows = await events()
    expect(new Set(rows.map((r) => r.summary))).toEqual(
      new Set([
        "Updated your profile",
        "Added an email template",
        "Added a contact",
        "Edited Hooli",
        "Added a note to Hooli",
      ])
    )
    expect(JSON.stringify(rows)).not.toMatch(/private|pat@hooli/i)
    const user = await t.run((ctx) => ctx.db.get("users", userId))
    expect(await as.query(api.api.activity.joinedAt, {})).toBe(user?._creationTime)
  })

  it("rolls an edit's row back with the edit", async () => {
    const { as, otherId, events, t } = await setup()
    const theirs = await t.run((ctx) =>
      ctx.db.insert("applications", {
        userId: otherId,
        company: "Theirs",
        role: "Engineer",
        status: "applied",
        number: 1,
        history: [],
      })
    )
    await expect(
      as.mutation(api.api.applications.addNote, { id: theirs, text: "x" })
    ).rejects.toThrow()
    expect(await events()).toEqual([])
  })

  it("lists failures per person, and forgets what's old", async () => {
    const { t, userId, otherId } = await setup()
    const failed = (who: typeof userId, at: number, error: string) =>
      t.run((ctx) =>
        ctx.db.insert("activityEvents", {
          userId: who,
          work: "mail.send",
          at,
          failed: true,
          outcome: "failed",
          error,
        })
      )
    const now = Date.now()
    await failed(userId, now - 2000, "older")
    await failed(userId, now - 1000, "newer")
    await failed(otherId, now - 1000, "theirs")
    const groups = await t.query(internal.api.activity.failures, {})
    expect(groups).toHaveLength(2)
    expect(groups.find((g) => g.userId === userId)).toMatchObject({
      work: "mail.send",
      count: 2,
      lastError: "newer",
    })
    await failed(userId, now - 91 * 24 * 60 * 60 * 1000, "ancient")
    await t.mutation(internal.api.activity.sweep, {})
    await t.finishAllScheduledFunctions(vi.runAllTimers)
    const left = await t.run((ctx) => ctx.db.query("activityEvents").collect())
    expect(new Set(left.map((r) => r.error))).toEqual(new Set(["newer", "older", "theirs"]))
  })
})
