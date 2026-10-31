// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import rateLimiter from "@convex-dev/rate-limiter/test"
import workpool from "@convex-dev/workpool/test"
import { convexTest } from "convex-test"
import { beforeEach, describe, expect, it, vi } from "vite-plus/test"

import { api, components, internal } from "../../_generated/api"
import type { Id } from "../../_generated/dataModel"
import cloudflareSchema from "../../components/cloudflareEmail/schema"
import notificationsSchema from "../../components/notifications/schema"
import { seal } from "../../lib/secrets"
import schema from "../../schema"
import { aad, keys } from "../email/utils"

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

const withoutSystemFields = <T extends object>(
  row: T & { _id: unknown; _creationTime: unknown }
) => {
  const { _id, _creationTime, ...fields } = row
  return fields
}

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
  const as = t.withIdentity({ subject: userId })
  const receive = async (mail: object) => {
    const emailId: string = await t.run(async (ctx) =>
      ctx.runMutation(components.cloudflareEmail.lib.receive, {
        owner: userId,
        payload: await seal(
          k,
          JSON.stringify({
            subject: "Hi",
            from: "pat@hooli.com",
            to: [],
            attachments: [],
            ...mail,
          }),
          aad.email(userId)
        ),
      })
    )
    await t.action(internal.api.email.sortMail, { userId, emailId })
    await t.finishAllScheduledFunctions(vi.runAllTimers)
  }
  const box = async (name: "inbox" | "sent" | "archived" | "trash") =>
    (await as.query(api.api.mailbox.page, { box: name, paginationOpts: first })).page
  return { t, as, userId, hooli, receive, box }
}

describe("folders", () => {
  it("puts new mail in the Inbox, unread, with its application", async () => {
    const { as, receive, box } = await setup()
    await receive({ subject: "Hello from Hooli" })
    const [row] = await box("inbox")
    expect(row).toMatchObject({ subject: "Hello from Hooli", read: false, company: "Hooli" })
    await as.mutation(api.api.mailbox.markRead, { eventId: row!.id })
    expect((await box("inbox"))[0]?.read).toBe(true)
  })

  it("moves between folders, and back to where it came from", async () => {
    const { as, receive, box, hooli } = await setup()
    await receive({})
    const [row] = await box("inbox")
    await as.mutation(api.api.mailbox.move, { eventId: row!.id, to: "archived" })
    expect(await box("inbox")).toHaveLength(0)
    expect(await box("archived")).toHaveLength(1)
    await as.mutation(api.api.mailbox.move, { eventId: row!.id, to: "back" })
    expect(await box("inbox")).toHaveLength(1)

    await as.action(api.api.email.sendFromApplication, {
      applicationId: hooli,
      to: "pat@hooli.com",
      subject: "Sent one",
      text: "Hi",
    })
    const [sent] = await box("sent")
    await as.mutation(api.api.mailbox.move, { eventId: sent!.id, to: "trash" })
    await as.mutation(api.api.mailbox.move, { eventId: sent!.id, to: "back" })
    expect(await box("sent")).toHaveLength(1)
  })

  it("takes trashed mail off an application's timeline, but not archived", async () => {
    const { as, receive, box } = await setup()
    await receive({})
    const [row] = await box("inbox")
    await as.mutation(api.api.mailbox.move, { eventId: row!.id, to: "archived" })
    expect(await as.query(api.api.email.timeline, {})).toHaveLength(1)
    await as.mutation(api.api.mailbox.move, { eventId: row!.id, to: "trash" })
    expect(await as.query(api.api.email.timeline, {})).toHaveLength(0)
  })

  it("keeps the count on the application's card right through every move", async () => {
    const { t, as, receive, box, hooli } = await setup()
    const summary = async () => (await t.run((ctx) => ctx.db.get("applications", hooli)))?.mail
    expect(await summary()).toBeUndefined()

    await receive({ subject: "One" })
    await receive({ subject: "Two" })
    expect(await summary()).toMatchObject({ count: 2 })
    const rows = await box("inbox")
    const [newest, older] = rows
    expect((await summary())?.at).toBe(newest!.at)

    // Binning the newest drops it from the count, and the older one is the latest again.
    await as.mutation(api.api.mailbox.move, { eventId: newest!.id, to: "trash" })
    expect(await summary()).toMatchObject({ count: 1, at: older!.at })
    await as.mutation(api.api.mailbox.move, { eventId: newest!.id, to: "back" })
    expect(await summary()).toMatchObject({ count: 2, at: newest!.at })
    // Archived still counts.
    await as.mutation(api.api.mailbox.move, { eventId: newest!.id, to: "archived" })
    expect(await summary()).toMatchObject({ count: 2 })

    // Filed elsewhere, it leaves this card and joins that one.
    const acme = await t.run(async (ctx) => {
      const self = (await ctx.db.get("applications", hooli))!
      return ctx.db.insert("applications", { ...withoutSystemFields(self), number: 2 })
    })
    await as.mutation(api.api.email.assign, { eventId: older!.id, applicationId: acme })
    expect(await summary()).toMatchObject({ count: 1, at: newest!.at })
    expect((await t.run((ctx) => ctx.db.get("applications", acme)))?.mail).toMatchObject({
      count: 1,
      at: older!.at,
    })

    // Deleted for good, and sent mail counts too.
    await as.mutation(api.api.mailbox.move, { eventId: newest!.id, to: "trash" })
    await as.mutation(api.api.mailbox.deleteForever, { eventId: newest!.id })
    expect(await summary()).toBeUndefined()
    await as.action(api.api.email.sendFromApplication, {
      applicationId: hooli,
      to: "pat@hooli.com",
      subject: "Sent one",
      text: "Hi",
    })
    expect(await summary()).toMatchObject({ count: 1, kind: "other" })
  })

  it("only deletes for good from the Trash, and takes the email with it", async () => {
    const { t, as, receive, box } = await setup()
    await receive({})
    const [row] = await box("inbox")
    await expect(as.mutation(api.api.mailbox.deleteForever, { eventId: row!.id })).rejects.toThrow(
      "Trash first"
    )
    await as.mutation(api.api.mailbox.move, { eventId: row!.id, to: "trash" })
    await as.mutation(api.api.mailbox.deleteForever, { eventId: row!.id })
    expect(await t.run((ctx) => ctx.db.query("mailEvents").collect())).toHaveLength(0)
    expect(await as.query(api.api.email.recentMail, {})).toHaveLength(0)
  })

  it("counts only the Updates lines it can show", async () => {
    const { as, receive, box } = await setup()
    await receive({})
    await receive({ subject: "Second" })
    expect(await as.query(api.api.inbox.unreadCount, {})).toBe(2)
    const [got] = await box("inbox")
    await as.mutation(api.api.mailbox.move, { eventId: got!.id, to: "trash" })
    await as.mutation(api.api.mailbox.deleteForever, { eventId: got!.id })
    const lines = await as.query(api.api.inbox.inbox, {})
    expect(lines.filter((l) => l.unread)).toHaveLength(1)
    expect(await as.query(api.api.inbox.unreadCount, {})).toBe(1)
    await as.mutation(api.api.inbox.setRead, { read: true })
    expect(await as.query(api.api.inbox.unreadCount, {})).toBe(0)
  })

  it("says whether you sent an email, so a reply knows who to go to", async () => {
    const { as, receive, box, hooli } = await setup()
    await receive({})
    const [got] = await box("inbox")
    expect((await as.query(api.api.mailbox.content, { eventId: got!.id }))?.sent).toBe(false)
    await as.action(api.api.email.sendFromApplication, {
      applicationId: hooli,
      to: "pat@hooli.com",
      subject: "Sent one",
      text: "Hi",
    })
    const [sent] = await box("sent")
    expect(await as.query(api.api.mailbox.content, { eventId: sent!.id })).toMatchObject({
      sent: true,
      to: "pat@hooli.com",
    })
  })

  it("pages, so a big folder only opens what's on screen", async () => {
    const { as, receive } = await setup()
    await receive({ subject: "One" })
    await receive({ subject: "Two" })
    await receive({ subject: "Three" })
    const page = await as.query(api.api.mailbox.page, {
      box: "inbox",
      paginationOpts: { numItems: 2, cursor: null },
    })
    expect(page.page).toHaveLength(2)
    expect(page.isDone).toBe(false)
  })
})

describe("unread", () => {
  it("counts the Inbox's unread mail, and can put one back", async () => {
    const { as, receive, box } = await setup()
    expect(await as.query(api.api.mailbox.unreadCount, {})).toBe(0)
    await receive({ subject: "One" })
    await receive({ subject: "Two" })
    expect(await as.query(api.api.mailbox.unreadCount, {})).toBe(2)
    const [row] = await box("inbox")
    await as.mutation(api.api.mailbox.markRead, { eventId: row!.id })
    expect(await as.query(api.api.mailbox.unreadCount, {})).toBe(1)
    await as.mutation(api.api.mailbox.markUnread, { eventId: row!.id })
    expect(await as.query(api.api.mailbox.unreadCount, {})).toBe(2)
    expect((await box("inbox")).find((m) => m.id === row!.id)?.read).toBe(false)
  })

  it("leaves other folders out of the count", async () => {
    const { as, receive, box } = await setup()
    await receive({})
    const [row] = await box("inbox")
    await as.mutation(api.api.mailbox.move, { eventId: row!.id, to: "archived" })
    expect(await as.query(api.api.mailbox.unreadCount, {})).toBe(0)
  })

  it("gives sent mail no read state", async () => {
    const { as, box, hooli } = await setup()
    await as.action(api.api.email.sendFromApplication, {
      applicationId: hooli,
      to: "pat@hooli.com",
      subject: "Sent one",
      text: "Hi",
    })
    const [sent] = await box("sent")
    await as.mutation(api.api.mailbox.markUnread, { eventId: sent!.id })
    expect((await box("sent"))[0]?.read).toBe(true)
    expect(await as.query(api.api.mailbox.unreadCount, {})).toBe(0)
  })

  it("keeps someone else's mail away", async () => {
    const { t, receive, box } = await setup()
    await receive({})
    const [mine] = await box("inbox")
    const other = await t.run((ctx) => ctx.db.insert("users", { name: "Eve" }))
    const eve = t.withIdentity({ subject: other })
    expect(await eve.query(api.api.mailbox.unreadCount, {})).toBe(0)
    await expect(eve.mutation(api.api.mailbox.markUnread, { eventId: mine!.id })).rejects.toThrow(
      "That email isn't yours."
    )
  })
})

describe("threads", () => {
  const subjects = async (as: Awaited<ReturnType<typeof setup>>["as"], eventId: Id<"mailEvents">) =>
    (await as.query(api.api.mailbox.thread, { eventId })).map((m) => m.subject)

  it("follows a reply across folders, oldest first", async () => {
    const { as, receive, box, hooli } = await setup()
    await receive({ subject: "Scheduling" })
    await as.action(api.api.email.sendFromApplication, {
      applicationId: hooli,
      to: "pat@hooli.com",
      subject: "Re: Scheduling",
      text: "Thanks",
    })
    await vi.advanceTimersByTimeAsync(1000)
    await receive({ subject: "RE: re: scheduling" })
    await receive({ subject: "Offer" })
    const opened = (await box("inbox")).find((m) => m.subject === "Scheduling")
    expect(await subjects(as, opened!.id)).toEqual([
      "Scheduling",
      "Re: Scheduling",
      "RE: re: scheduling",
    ])
  })

  it("keeps another application's mail out, even with the same subject", async () => {
    const { t, as, userId, receive, box } = await setup()
    await t.run((ctx) =>
      ctx.db.insert("applications", {
        userId,
        company: "Initech",
        role: "Engineer",
        status: "applied",
        number: 2,
        history: [],
      })
    )
    await receive({ subject: "Next steps" })
    await receive({ subject: "Next steps", from: "sam@initech.com" })
    const [newest] = await box("inbox")
    expect(newest?.company).toBe("Initech")
    expect(await subjects(as, newest!.id)).toEqual(["Next steps"])
  })

  it("needs the same person when there's no application", async () => {
    const { as, receive, box } = await setup()
    await receive({ subject: "Hello", from: "lee@stranger.example" })
    await vi.advanceTimersByTimeAsync(1000)
    await receive({ subject: "Re: Hello", from: "LEE@stranger.example" })
    await receive({ subject: "Hello", from: "kim@stranger.example" })
    const rows = await box("inbox")
    expect(rows.every((m) => m.applicationId === undefined)).toBe(true)
    const kim = rows.find((m) => m.from === "kim@stranger.example")
    const lee = rows.find((m) => m.from === "lee@stranger.example")
    expect(await subjects(as, kim!.id)).toEqual(["Hello"])
    expect(await subjects(as, lee!.id)).toEqual(["Hello", "Re: Hello"])
  })

  it("leaves out trashed mail unless it's the one open", async () => {
    const { as, receive, box } = await setup()
    await receive({ subject: "Scheduling" })
    await receive({ subject: "Re: Scheduling" })
    const [reply, first] = await box("inbox")
    await as.mutation(api.api.mailbox.move, { eventId: reply!.id, to: "trash" })
    expect(await subjects(as, first!.id)).toEqual(["Scheduling"])
    expect(await subjects(as, reply!.id)).toEqual(["Scheduling", "Re: Scheduling"])
  })

  it("gives someone else nothing", async () => {
    const { t, receive, box } = await setup()
    await receive({})
    const [mine] = await box("inbox")
    const other = await t.run((ctx) => ctx.db.insert("users", { name: "Eve" }))
    expect(
      await t.withIdentity({ subject: other }).query(api.api.mailbox.thread, { eventId: mine!.id })
    ).toEqual([])
  })
})

describe("labels", () => {
  it("adds, finds by label, and forgets one nothing uses", async () => {
    const { as, receive, box } = await setup()
    await receive({ subject: "One" })
    await receive({ subject: "Two" })
    const [row] = await box("inbox")
    await as.mutation(api.api.mailbox.setLabels, {
      eventId: row!.id,
      labels: [" Urgent ", "Urgent", "Later"],
    })
    expect((await as.query(api.api.mailbox.labels, {})).sort()).toEqual(["Later", "Urgent"])
    const found = await as.query(api.api.mailbox.page, { label: "Urgent", paginationOpts: first })
    expect(found.page.map((r) => r.id)).toEqual([row!.id])
    expect(found.page[0]?.labels).toEqual(["Urgent", "Later"])

    await as.mutation(api.api.mailbox.setLabels, { eventId: row!.id, labels: ["Later"] })
    expect(await as.query(api.api.mailbox.labels, {})).toEqual(["Later"])
    expect(
      (await as.query(api.api.mailbox.page, { label: "Urgent", paginationOpts: first })).page
    ).toHaveLength(0)
  })

  it("leaves trashed mail out of a label", async () => {
    const { as, receive, box } = await setup()
    await receive({})
    const [row] = await box("inbox")
    await as.mutation(api.api.mailbox.setLabels, { eventId: row!.id, labels: ["Keep"] })
    await as.mutation(api.api.mailbox.move, { eventId: row!.id, to: "trash" })
    expect(
      (await as.query(api.api.mailbox.page, { label: "Keep", paginationOpts: first })).page
    ).toHaveLength(0)
  })
})

describe("drafts", () => {
  const body = { to: "pat@hooli.com", subject: "Draft", html: "<p>Hi</p>", text: "Hi" }

  it("saves, updates, and goes once it's sent", async () => {
    const { as, box } = await setup()
    const id = await as.action(api.api.mailbox.saveDraft, body)
    await as.action(api.api.mailbox.saveDraft, { ...body, id, subject: "Better" })
    const { page } = await as.query(api.api.mailbox.drafts, { paginationOpts: first })
    expect(page.map((d) => d.subject)).toEqual(["Better"])
    expect((await as.query(api.api.mailbox.draft, { id }))?.html).toBe("<p>Hi</p>")

    await as.action(api.api.email.sendFromApplication, {
      to: body.to,
      subject: "Better",
      text: "Hi",
      html: "<p>Hi</p>",
      draftId: id,
    })
    expect((await as.query(api.api.mailbox.drafts, { paginationOpts: first })).page).toHaveLength(0)
    const [sent] = await box("sent")
    expect(sent).toMatchObject({ subject: "Better", sent: true })
    expect(sent?.applicationId).toBeUndefined()
    expect(JSON.parse(fetchMock.mock.calls[0]![1]!.body as string).html).toBe("<p>Hi</p>")
  })

  it("keeps a draft away from someone else", async () => {
    const { t, as } = await setup()
    const id = await as.action(api.api.mailbox.saveDraft, body)
    const other = t.withIdentity({
      subject: await t.run((ctx) => ctx.db.insert("users", { name: "Other" })),
    })
    expect(await other.query(api.api.mailbox.draft, { id })).toBeNull()
  })
})

describe("templates", () => {
  it("saves, edits, removes, and stays yours", async () => {
    const { t, as } = await setup()
    const id = await as.mutation(api.api.mailbox.saveTemplate, {
      name: "Follow up",
      subject: "About {role}",
      html: "<p>Hello {company}</p>",
    })
    await as.mutation(api.api.mailbox.saveTemplate, {
      id,
      name: "Nudge",
      subject: "x",
      html: "<p>y</p>",
    })
    expect((await as.query(api.api.mailbox.templates, {})).map((x) => x.name)).toEqual(["Nudge"])
    const other = t.withIdentity({
      subject: await t.run((ctx) => ctx.db.insert("users", { name: "Other" })),
    })
    expect(await other.query(api.api.mailbox.templates, {})).toEqual([])
    await expect(
      other.mutation(api.api.mailbox.saveTemplate, { id, name: "Mine", subject: "", html: "" })
    ).rejects.toThrow("isn't here")
    await as.mutation(api.api.mailbox.removeTemplate, { id })
    expect(await as.query(api.api.mailbox.templates, {})).toEqual([])
  })

  it("wants a name", async () => {
    const { as } = await setup()
    await expect(
      as.mutation(api.api.mailbox.saveTemplate, { name: " ", subject: "", html: "" })
    ).rejects.toThrow("Give it a name")
  })
})
