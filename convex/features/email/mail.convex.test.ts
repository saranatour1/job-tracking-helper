// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import rateLimiter from "@convex-dev/rate-limiter/test"
import workpool from "@convex-dev/workpool/test"
import { convexTest } from "convex-test"
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test"

import { api, components, internal } from "../../_generated/api"
import type { Id } from "../../_generated/dataModel"
import cloudflareSchema from "../../components/cloudflareEmail/schema"
import notificationsSchema from "../../components/notifications/schema"
import { seal } from "../../lib/secrets"
import schema from "../../schema"
import { aad, keys } from "./utils"

const modules = import.meta.glob([
  "../../**/*.ts",
  "!../../components/notifications/**",
  "!../../components/cloudflareEmail/**",
  "!../../**/*.test.ts",
])

const fetchMock = vi.fn<typeof fetch>()

beforeEach(() => {
  vi.stubEnv("SECRETS_KEYS", `v1:${btoa(String.fromCharCode(...new Uint8Array(32).fill(7)))}`)
  vi.stubGlobal("fetch", fetchMock)
  fetchMock.mockReset()
  fetchMock.mockImplementation(
    async () =>
      new Response(JSON.stringify({ success: true, result: { delivered: ["a"] } }), { status: 200 })
  )
})
afterEach(() => void vi.unstubAllGlobals())

const setup = async (allow: { tag: boolean } = { tag: true }) => {
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
  const { userId, hooli, acme } = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { name: "Sam", email: "sam@example.com" })
    await ctx.db.insert("emailConnections", {
      userId,
      details: await seal(
        k,
        JSON.stringify({ accountId: "a", fromAddress: "reach@example.com", zoneId: "z" }),
        aad.details(userId)
      ),
      token: await seal(k, "token", aad.token(userId)),
      tokenAddedAt: 1,
      access: { workers: true, routing: true },
      allow: { send: true, setup: true, receive: true, read: false, move: false, ...allow },
      inboundId: "in",
      inbound: { secretHash: "h", worker: "w", ruleId: "r", at: 1 },
    })
    const add = (company: string, number: number) =>
      ctx.db.insert("applications", {
        userId,
        company,
        role: "Engineer",
        status: "saved",
        number,
        history: [],
      })
    return { userId, hooli: await add("Hooli", 3), acme: await add("Acme", 4) }
  })
  const receive = async (mail: object) => {
    const emailId: string = await t.run(async (ctx) =>
      ctx.runMutation(components.cloudflareEmail.lib.receive, {
        owner: userId,
        payload: await seal(
          k,
          JSON.stringify({ subject: "Hi", from: "x@y.io", to: [], attachments: [], ...mail }),
          aad.email(userId)
        ),
      })
    )
    await t.action(internal.email.sortMail, { userId, emailId })
    return t.run(async (ctx) =>
      (await ctx.db.query("mailEvents").collect()).find((e) => e.emailId === emailId)
    )
  }
  return { t, as: t.withIdentity({ subject: userId }), userId, hooli, acme, receive }
}

describe("incoming mail", () => {
  it("files mail to an application's address there, even if it names another company", async () => {
    const { receive, hooli } = await setup()
    const event = await receive({
      to: ["reach+app-3@example.com"],
      subject: "Your application at Acme",
    })
    expect(event).toMatchObject({ applicationId: hooli, by: "tag" })
  })

  it("falls back to guessing for a tag that matches nothing, or one in the Trash", async () => {
    const { t, receive, acme } = await setup()
    expect((await receive({ to: ["reach+app-99@example.com"] }))?.applicationId).toBeUndefined()
    await t.run((ctx) => ctx.db.patch("applications", acme, { trashedAt: 5 }))
    expect((await receive({ to: ["reach+app-4@example.com"] }))?.applicationId).toBeUndefined()
  })
})

describe("the connection", () => {
  it("only says each application has an address when mail to it would arrive", async () => {
    expect((await (await setup()).as.query(api.email.connection, {}))?.tracking).toBe(true)
    const off = await setup({ tag: false })
    expect((await off.as.query(api.email.connection, {}))?.tracking).toBe(false)
  })
})

describe("sending from an application", () => {
  const body = () => JSON.parse(fetchMock.mock.calls[0]![1]!.body as string)
  const mail = { to: "pat@hooli.com", subject: "Hello", text: "Hi Pat" }

  it("aims replies at the application's address, and adds it to the timeline", async () => {
    const { t, as, hooli } = await setup()
    await as.action(api.email.sendFromApplication, { applicationId: hooli, ...mail })
    expect(body()).toMatchObject({
      from: "reach@example.com",
      reply_to: "reach+app-3@example.com",
      to: ["pat@hooli.com"],
    })
    const [line] = await as.query(api.email.timeline, {})
    expect(line).toMatchObject({ applicationId: hooli, sent: true, to: "pat@hooli.com" })
    expect((await as.query(api.email.mailBody, { eventId: line!.id }))?.text).toBe("Hi Pat")
    // Your own mail isn't news.
    expect(await as.query(api.inbox.inbox)).toHaveLength(0)
    await t.finishInProgressScheduledFunctions()
  })

  it("leaves Reply-To alone until mail to that address would arrive", async () => {
    const { as, hooli } = await setup({ tag: false })
    await as.action(api.email.sendFromApplication, { applicationId: hooli, ...mail })
    expect(body().reply_to).toBeUndefined()
  })

  it("threads a reply to the email it answers", async () => {
    const { as, hooli, receive } = await setup()
    const event = await receive({
      to: ["reach+app-3@example.com"],
      messageId: "<new@y.io>",
      references: "<old@y.io>",
    })
    await as.action(api.email.sendFromApplication, {
      applicationId: hooli,
      ...mail,
      replyTo: event!._id,
    })
    expect(body().headers).toEqual({
      "In-Reply-To": "<new@y.io>",
      References: "<old@y.io> <new@y.io>",
    })
  })

  it("adds nothing to the timeline when Cloudflare refuses, and says why", async () => {
    const { as, hooli } = await setup()
    fetchMock.mockImplementation(
      async () =>
        new Response(JSON.stringify({ success: false, errors: [{ message: "nope" }] }), {
          status: 400,
        })
    )
    await expect(
      as.action(api.email.sendFromApplication, { applicationId: hooli, ...mail })
    ).rejects.toThrow("nope")
    expect(await as.query(api.email.timeline, {})).toHaveLength(0)
  })

  it("won't send for someone else's application, or with the switch off", async () => {
    const { t, hooli, userId } = await setup()
    const otherId = await t.run((ctx) => ctx.db.insert("users", { name: "Other" }))
    await expect(
      t
        .withIdentity({ subject: otherId })
        .action(api.email.sendFromApplication, { applicationId: hooli, ...mail })
    ).rejects.toThrow("Connect Cloudflare first.")
    await t.run(async (ctx) => {
      const row = await ctx.db.query("emailConnections").first()
      await ctx.db.patch("emailConnections", row!._id, { allow: { ...row!.allow, send: false } })
    })
    await expect(
      t
        .withIdentity({ subject: userId as Id<"users"> })
        .action(api.email.sendFromApplication, { applicationId: hooli, ...mail })
    ).rejects.toThrow("Send email")
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
