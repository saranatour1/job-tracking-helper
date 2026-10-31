// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import rateLimiter from "@convex-dev/rate-limiter/test"
import { convexTest } from "convex-test"
import { describe, expect, it, vi } from "vite-plus/test"

import { api, components, internal } from "../../_generated/api"
import cloudflareSchema from "../../components/cloudflareEmail/schema"
import notificationsSchema from "../../components/notifications/schema"
import { parseKeys, seal } from "../../lib/secrets"
import schema from "../../schema"
import { contactAad } from "../contacts/internal"
import { draftAad } from "../mailbox/utils"
import { aad } from "./utils"

const modules = import.meta.glob([
  "../../**/*.ts",
  "!../../components/notifications/**",
  "!../../components/cloudflareEmail/**",
  "!../../**/*.test.ts",
])

const keyOf = (byte: number) => btoa(String.fromCharCode(...new Uint8Array(32).fill(byte)))
const oldKey = `v1:${keyOf(1)}`
const newKey = `v2:${keyOf(2)}`

const setup = async () => {
  vi.stubEnv("SECRETS_KEYS", oldKey)
  const t = convexTest(schema, modules)
  rateLimiter.register(t as never)
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
  const k = await parseKeys(oldKey)
  // One of everything that gets sealed, all under the key about to go.
  const { userId, noteBefore } = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { name: "Sam" })
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
    const emailId: string = await ctx.runMutation(components.cloudflareEmail.lib.receive, {
      owner: userId,
      payload: await seal(
        k,
        JSON.stringify({
          subject: "Hi",
          from: "pat@hooli.com",
          to: [],
          attachments: [],
          text: "Body",
        }),
        aad.email(userId)
      ),
    })
    const noteBefore = await seal(
      k,
      JSON.stringify({ from: "Pat", subject: "Hello there" }),
      aad.email(userId)
    )
    await ctx.db.insert("mailEvents", {
      userId,
      emailId,
      kind: "other",
      note: noteBefore,
      at: 1,
      by: "rules",
      box: "inbox",
    })
    await ctx.db.insert("contacts", {
      userId,
      key: "k",
      details: await seal(
        k,
        JSON.stringify({
          company: "Hooli",
          name: "Pat",
          email: "pat@hooli.com",
          title: "",
          phone: "",
          notes: "",
        }),
        contactAad(userId)
      ),
      count: 1,
      lastAt: 1,
    })
    await ctx.db.insert("mailDrafts", {
      userId,
      details: await seal(
        k,
        JSON.stringify({ to: "pat@hooli.com", subject: "Draft", html: "<p>x</p>", text: "x" }),
        draftAad(userId)
      ),
      updatedAt: 1,
    })
    return { userId, noteBefore }
  })
  return { t, as: t.withIdentity({ subject: userId }), noteBefore }
}

const first = { numItems: 25, cursor: null }

describe("rotating the key", () => {
  it("leaves everything readable once the old key is gone", async () => {
    const { t, as } = await setup()
    vi.stubEnv("SECRETS_KEYS", `${oldKey},${newKey}`)
    expect(await t.action(internal.email.resealAll, {})).toEqual({
      connections: 1,
      emails: 1,
      notes: 1,
      contacts: 1,
      drafts: 1,
    })

    vi.stubEnv("SECRETS_KEYS", newKey)
    const [line] = await as.query(api.email.timeline, {})
    expect(line).toMatchObject({ from: "Pat", subject: "Hello there" })
    expect(
      (await as.query(api.mailbox.page, { box: "inbox", paginationOpts: first })).page
    ).toHaveLength(1)
    expect((await as.query(api.email.mailBody, { eventId: line!.id }))?.text).toBe("Body")
    expect((await as.query(api.contacts.list, {}))[0]?.email).toBe("pat@hooli.com")
    expect((await as.query(api.mailbox.drafts, { paginationOpts: first })).page[0]?.subject).toBe(
      "Draft"
    )
    expect((await as.query(api.email.connection, {}))?.fromAddress).toBe("jobs@example.com")
  })

  it("loses mail notes if the pass is skipped, which is what this guards against", async () => {
    const { as } = await setup()
    vi.stubEnv("SECRETS_KEYS", newKey)
    expect(await as.query(api.email.timeline, {})).toEqual([])
  })

  it("has nothing left to do the second time", async () => {
    const { t } = await setup()
    vi.stubEnv("SECRETS_KEYS", `${oldKey},${newKey}`)
    await t.action(internal.email.resealAll, {})
    expect(await t.action(internal.email.resealAll, {})).toEqual({
      connections: 0,
      emails: 0,
      notes: 0,
      contacts: 0,
      drafts: 0,
    })
  })

  it("leaves alone a note that changed while it ran", async () => {
    const { t, noteBefore } = await setup()
    const id = await t.run(async (ctx) => (await ctx.db.query("mailEvents").first())!._id)
    await t.mutation(internal.email.resealNote, { id, from: "something else", note: "replacement" })
    expect(await t.run(async (ctx) => (await ctx.db.get("mailEvents", id))?.note)).toBe(noteBefore)
  })
})
