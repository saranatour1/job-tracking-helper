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

const mocks = vi.hoisted(() => ({ decide: vi.fn() }))
vi.mock("ai", async (actual) => ({
  ...(await actual<typeof import("ai")>()),
  experimental_decide: mocks.decide,
}))

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
      to: ["reach+hooli@example.com"],
      subject: "Your application at Acme",
    })
    expect(event).toMatchObject({ applicationId: hooli, by: "tag" })
  })

  it("picks by role when a company has two applications", async () => {
    const { t, userId, receive } = await setup()
    const designer = await t.run((ctx) =>
      ctx.db.insert("applications", {
        userId,
        company: "Hooli",
        role: "Product Designer",
        status: "saved",
        number: 9,
        history: [],
      })
    )
    const event = await receive({
      to: ["reach+hooli@example.com"],
      subject: "Your Product Designer application",
    })
    expect(event?.applicationId).toBe(designer)
  })

  it("falls back to guessing for a tag that matches nothing, or one in the Trash", async () => {
    const { t, receive, acme } = await setup()
    expect((await receive({ to: ["reach+nobody@example.com"] }))?.applicationId).toBeUndefined()
    await t.run((ctx) => ctx.db.patch("applications", acme, { trashedAt: 5 }))
    expect((await receive({ to: ["reach+acme@example.com"] }))?.applicationId).toBeUndefined()
  })
})

describe("with Jev reading mail", () => {
  const withJev = async (answers: object) => {
    const s = await setup()
    mocks.decide.mockResolvedValue({ answers })
    await s.t.run(async (ctx) => {
      const row = await ctx.db.query("emailConnections").first()
      await ctx.db.patch("emailConnections", row!._id, { allow: { ...row!.allow, read: true } })
    })
    return s
  }
  const sure = (choice: string) => ({ choice, probabilities: { [choice]: 0.9 } })

  it("keeps the rules' match when Jev finds none", async () => {
    const { receive, hooli } = await withJev({ application: sure("none"), kind: sure("other") })
    expect(await receive({ from: "jobs@hooli.com", subject: "An update" })).toMatchObject({
      applicationId: hooli,
      by: "jev",
    })
  })

  it("lets Jev change the rules' match", async () => {
    // Newest first, so a0 is Acme.
    const { receive, acme } = await withJev({ application: sure("a0"), kind: sure("other") })
    expect(await receive({ from: "jobs@hooli.com", subject: "An update" })).toMatchObject({
      applicationId: acme,
    })
  })

  it("files what Jev finds when the rules found nothing", async () => {
    const { receive, acme } = await withJev({ application: sure("a0"), kind: sure("other") })
    expect((await receive({ from: "x@y.io", subject: "A role" }))?.applicationId).toBe(acme)
  })
})

describe("importing old mail", () => {
  const raw = (
    from: string,
    subject: string,
    id: string,
    date = "Mon, 05 Jan 2026 10:00:00 +0000"
  ) =>
    `From: ${from}\r\nTo: me@other.com\r\nSubject: ${subject}\r\nMessage-ID: <${id}@y.io>\r\nDate: ${date}\r\nContent-Type: text/plain\r\n\r\nUnfortunately we won't be moving forward.\r\n`

  it("files what matches at its own date, quietly, and only once", async () => {
    const { as, hooli, t } = await setup()
    const mail = raw("People <jobs@hooli.com>", "Your application", "one")
    expect(await as.action(api.email.importMail, { raw: mail })).toBe("filed")
    const [line] = await as.query(api.email.timeline, {})
    expect(line).toMatchObject({ applicationId: hooli, kind: "rejection" })
    expect(line?.at).toBe(Date.parse("Mon, 05 Jan 2026 10:00:00 +0000"))
    expect(line?.suggest).toBeUndefined()
    expect(await as.query(api.inbox.inbox)).toHaveLength(0)
    expect(await as.action(api.email.importMail, { raw: mail })).toBe("known")
    expect(await t.run((ctx) => ctx.db.query("mailEvents").collect())).toHaveLength(1)
  })

  it("keeps nothing that matches no application", async () => {
    const { as, t } = await setup()
    expect(await as.action(api.email.importMail, { raw: raw("x@shop.com", "Sale", "two") })).toBe(
      "unmatched"
    )
    expect(await t.run((ctx) => ctx.db.query("mailEvents").collect())).toHaveLength(0)
    expect(await as.query(api.email.recentMail, {})).toHaveLength(0)
  })

  it("needs Keep incoming mail on", async () => {
    const { as, t } = await setup()
    await t.run(async (ctx) => {
      const row = await ctx.db.query("emailConnections").first()
      await ctx.db.patch("emailConnections", row!._id, { allow: { ...row!.allow, receive: false } })
    })
    await expect(as.action(api.email.importMail, { raw: raw("a@b.c", "x", "y") })).rejects.toThrow(
      "Keep incoming mail"
    )
  })
})

describe("an address without a plus", () => {
  it("adds one routing rule, once, and files mail sent to it", async () => {
    const { as, hooli, receive } = await setup()
    const rules: { id: string; matchers: { type: string; value: string }[] }[] = []
    fetchMock.mockImplementation(async (_, init) => {
      if (init?.method === "POST") {
        const { matchers } = JSON.parse(init.body as string)
        rules.push({ id: "rule1", matchers })
        return new Response(JSON.stringify({ success: true, result: { id: "rule1" } }), {
          status: 200,
        })
      }
      return new Response(JSON.stringify({ success: true, result: rules }), { status: 200 })
    })
    const args = { applicationId: hooli }
    expect(await as.action(api.email.makeAddressWithoutPlus, args)).toBe("reach.hooli@example.com")
    expect(await as.action(api.email.makeAddressWithoutPlus, args)).toBe("reach.hooli@example.com")
    expect(rules).toHaveLength(1)
    expect(rules[0]?.matchers[0]?.value).toBe("reach.hooli@example.com")
    expect((await as.query(api.email.connection, {}))?.tracking).toBe(true)
    expect(await receive({ to: ["reach.hooli@example.com"] })).toMatchObject({
      applicationId: hooli,
      by: "tag",
    })
  })
})

describe("setting up incoming mail", () => {
  it("stops, and says who gets the mail, when a rule already handles the address", async () => {
    const { t, as } = await setup()
    await t.run(async (ctx) => {
      const row = await ctx.db.query("emailConnections").first()
      const k = await keys()
      await ctx.db.patch("emailConnections", row!._id, {
        details: await seal(
          k,
          JSON.stringify({ accountId: "a", fromAddress: "reach@example.com", zoneId: "z" }),
          aad.details(row!.userId)
        ),
        inboundId: undefined,
        inbound: undefined,
      })
    })
    fetchMock.mockImplementation(async (url) => {
      const rules = (url as string).includes("/rules")
      return new Response(
        JSON.stringify({
          success: true,
          result: rules
            ? [
                {
                  id: "theirs",
                  matchers: [{ type: "literal", field: "to", value: "reach@example.com" }],
                  actions: [{ type: "forward", value: ["me@gmail.com"] }],
                },
              ]
            : { enabled: true },
        }),
        { status: 200 }
      )
    })
    await expect(as.action(api.email.setUpInbound, {})).rejects.toThrow("me@gmail.com")
    // Nothing was deployed: it only read.
    expect(fetchMock.mock.calls.every(([, init]) => (init?.method ?? "GET") === "GET")).toBe(true)
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
      from: { address: "reach@example.com", name: "Sam" },
      reply_to: "reach+hooli@example.com",
      to: ["pat@hooli.com"],
    })
    const [line] = await as.query(api.email.timeline, {})
    expect(line).toMatchObject({ applicationId: hooli, sent: true, to: "pat@hooli.com" })
    expect((await as.query(api.email.mailBody, { eventId: line!.id }))?.text).toBe("Hi Pat")
    // Your own mail isn't news.
    expect(await as.query(api.inbox.inbox)).toHaveLength(0)
    await t.finishInProgressScheduledFunctions()
  })

  it("sends under your saved full name, which beats your account's", async () => {
    const { t, as, hooli, userId } = await setup()
    await t.run((ctx) =>
      ctx.db.insert("profileEntries", {
        userId,
        kind: "field",
        group: "Contact",
        key: "field",
        label: "Full name",
        value: "Samantha Lee",
        order: 0,
      })
    )
    await as.action(api.email.sendFromApplication, { applicationId: hooli, ...mail })
    expect(body().from).toEqual({ address: "reach@example.com", name: "Samantha Lee" })
  })

  it("leaves Reply-To alone until mail to that address would arrive", async () => {
    const { as, hooli } = await setup({ tag: false })
    await as.action(api.email.sendFromApplication, { applicationId: hooli, ...mail })
    expect(body().reply_to).toBeUndefined()
  })

  it("threads a reply to the email it answers", async () => {
    const { as, hooli, receive } = await setup()
    const event = await receive({
      to: ["reach+hooli@example.com"],
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
