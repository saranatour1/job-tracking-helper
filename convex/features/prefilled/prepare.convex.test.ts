// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import rateLimiter from "@convex-dev/rate-limiter/test"
import workpool from "@convex-dev/workpool/test"
import { convexTest } from "convex-test"
import { beforeEach, describe, expect, it, vi } from "vite-plus/test"

import { api, internal } from "../../_generated/api"

const mocks = vi.hoisted(() => ({
  decide: vi.fn(),
  generateText: vi.fn(),
  interact: vi.fn(),
  scrape: vi.fn(),
}))
vi.mock("ai", async (actual) => ({
  ...(await actual<typeof import("ai")>()),
  experimental_decide: mocks.decide,
  generateText: mocks.generateText,
}))
vi.mock("./firecrawl", async (actual) => ({
  ...(await actual<typeof import("./firecrawl")>()),
  scrape: mocks.scrape,
  interact: mocks.interact,
  endSession: async () => undefined,
}))
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

const form = {
  login: false,
  captcha: false,
  fields: [
    { selector: "#phone", name: "phone", type: "tel", label: "Phone", required: true },
    { selector: "#why", name: "why", type: "textarea", label: "Why us?", required: true },
  ],
}

const setup = async () => {
  vi.stubEnv("FIRECRAWL_API_KEY", "fc-test")
  const t = convexTest(schema, modules)
  rateLimiter.register(t)
  workpool.register(t, "applyPool")
  t.registerComponent(
    "notifications",
    notificationsSchema,
    import.meta.glob("../../components/notifications/**/*.ts")
  )
  const { userId, jobId } = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { name: "Sam Lee", email: "sam@example.com" })
    const boardId = await ctx.db.insert("jobBoards", {
      kind: "greenhouse",
      slug: "hooli",
      company: "Hooli",
      addedAt: 0,
      jobs: 1,
    })
    const jobId = await ctx.db.insert("jobs", {
      boardId,
      urlKey: "job-boards.greenhouse.io/hooli/jobs/1",
      url: "https://job-boards.greenhouse.io/hooli/jobs/1",
      title: "Frontend Engineer",
      company: "Hooli",
      location: "Remote",
      remote: true,
      postedAt: 0,
      seenAt: 0,
      text: "Build the web app.",
    })
    const resumeId = await ctx.storage.store(new Blob(["%PDF-1.4"], { type: "application/pdf" }))
    await ctx.db.insert("preferences", {
      userId,
      workMode: "any",
      resumeId,
      resumeName: "cv.pdf",
      resumeText: "Sam Lee. Built web apps for 5 years.",
    })
    await ctx.db.insert("profileEntries", {
      userId,
      kind: "field",
      group: "Contact",
      key: "field",
      label: "Phone",
      value: "+1 555 0100",
      order: 2,
    })
    return { userId, jobId }
  })
  const as = t.withIdentity({ subject: userId })
  const id = await as.mutation(api.api.prefilled.prepare, { jobId })
  const row = async () => (await as.query(api.api.prefilled.get, { id }))!.prefill
  return { t, as, id, row }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.scrape.mockResolvedValue({ scrapeId: "scrape-1", markdown: "" })
  mocks.interact.mockResolvedValue({ value: form, liveUrl: "" })
  mocks.decide.mockResolvedValue({ answers: {} })
  mocks.generateText.mockResolvedValue({ text: '{"answers":["It fits."]}' })
})

describe("preparing without AI", () => {
  it("keeps what matched by name when Jev is out of tokens, and opens without AI", async () => {
    const { t, as, id, row } = await setup()
    mocks.decide.mockRejectedValue(new Error("SpendingLimitExceeded"))
    await t.action(internal.api.prefilledActions.prepareForm, { id })

    const prepared = await row()
    expect(prepared.status).toBe("needsAnswers")
    expect(prepared.aiUnavailable).toBe(true)
    expect(prepared.fields.map((f) => [f.question, f.answer])).toEqual([
      ["Phone", "+1 555 0100"],
      ["Why us?", undefined],
    ])
    expect(mocks.generateText).not.toHaveBeenCalled()

    vi.clearAllMocks()
    mocks.interact.mockResolvedValueOnce({ value: form, liveUrl: "" }).mockResolvedValueOnce({
      value: { unfilled: [], errors: [] },
      liveUrl: "https://live.example/x",
    })
    await as.action(api.api.prefilledActions.startLive, { id })
    expect(mocks.decide).not.toHaveBeenCalled()
    expect(mocks.generateText).not.toHaveBeenCalled()
    expect(mocks.interact.mock.calls[1]![1]).toContain("+1 555 0100")
    expect((await row()).status).toBe("live")
  })

  it("keeps the rest when only the draft fails", async () => {
    const { t, id, row } = await setup()
    mocks.generateText.mockRejectedValue(new Error("402"))
    await t.action(internal.api.prefilledActions.prepareForm, { id })
    const prepared = await row()
    expect(prepared.aiUnavailable).toBe(true)
    expect(prepared.fields[0]).toMatchObject({ answer: "+1 555 0100", source: "saved" })
  })

  it("clears the note once AI is back", async () => {
    const { t, as, id, row } = await setup()
    mocks.decide.mockRejectedValueOnce(new Error("402"))
    await t.action(internal.api.prefilledActions.prepareForm, { id })
    await as.mutation(api.api.prefilled.prepareAgain, { id })
    await t.action(internal.api.prefilledActions.prepareForm, { id })
    const prepared = await row()
    expect(prepared.aiUnavailable).toBeUndefined()
    expect(prepared.fields[1]).toMatchObject({ answer: "It fits.", source: "ai" })
  })
})

describe("with each application having its own address", () => {
  const trackingSetup = async () => {
    vi.stubEnv("SECRETS_KEYS", `v1:${btoa(String.fromCharCode(...new Uint8Array(32).fill(7)))}`)
    const s = await setup()
    const k = await keys()
    await s.t.run(async (ctx) => {
      const user = await ctx.db.query("users").first()
      await ctx.db.insert("emailConnections", {
        userId: user!._id,
        details: await seal(
          k,
          JSON.stringify({ accountId: "a", fromAddress: "reach@example.com" }),
          aad.details(user!._id)
        ),
        token: "t",
        tokenAddedAt: 1,
        access: { workers: true, routing: true },
        allow: { send: true, setup: true, receive: true, read: false, tag: true },
        inboundId: "in",
        inbound: { secretHash: "h", worker: "w", ruleId: "r", at: 1 },
      })
      await ctx.db.insert("profileEntries", {
        userId: user!._id,
        kind: "field",
        group: "Contact",
        key: "field",
        label: "Email",
        value: "reach@example.com",
        order: 1,
      })
    })
    const withEmail = {
      ...form,
      fields: [
        { selector: "#e", name: "email", type: "email", label: "Email", required: true },
        ...form.fields,
      ],
    }
    mocks.interact.mockResolvedValue({ value: withEmail, liveUrl: "" })
    await s.t.action(internal.api.prefilledActions.prepareForm, { id: s.id })
    mocks.interact.mockResolvedValueOnce({ value: withEmail, liveUrl: "" }).mockResolvedValueOnce({
      value: { unfilled: [], errors: [] },
      liveUrl: "https://live.example/x",
    })
    return s
  }

  it("makes the application when the browser opens, and fills the form with its address", async () => {
    const { t, as, id, row } = await trackingSetup()
    await as.action(api.api.prefilledActions.startLive, { id })
    const opened = await row()
    const app = await t.run((ctx) => ctx.db.get("applications", opened.applicationId!))
    expect(app).toMatchObject({ status: "saved", number: 1 })
    expect(opened.fields[0]).toMatchObject({ answer: "reach+hooli@example.com", source: "saved" })
    expect(mocks.interact.mock.calls.at(-1)![1]).toContain("reach+hooli@example.com")

    await t.mutation(internal.api.prefilled.finish, {
      userId: app!.userId,
      id,
      confirmation: "Thanks",
      credits: 1,
    })
    const apps = await t.run((ctx) => ctx.db.query("applications").collect())
    expect(apps.map((a) => [a.status, a.number])).toEqual([["applied", 1]])
  })

  it("keeps an address you typed for this form", async () => {
    const { as, id, row } = await trackingSetup()
    await as.mutation(api.api.prefilled.setAnswer, {
      id,
      question: "Email",
      answer: "me@other.com",
    })
    await as.action(api.api.prefilledActions.startLive, { id })
    expect((await row()).fields[0]).toMatchObject({ answer: "me@other.com", source: "you" })
  })
})

describe("choosing between answers", () => {
  it("prefers your saved full name to the account's short one", async () => {
    const { t, id, row } = await setup()
    await t.run(async (ctx) => {
      const user = await ctx.db.query("users").first()
      await ctx.db.insert("profileEntries", {
        userId: user!._id,
        kind: "field",
        group: "Contact",
        key: "field",
        label: "Full name",
        value: "Samantha Lee",
        order: 0,
      })
    })
    mocks.interact.mockResolvedValue({
      value: {
        ...form,
        fields: [
          { selector: "#n", name: "name", type: "text", label: "Full name", required: true },
        ],
      },
      liveUrl: "",
    })
    await t.action(internal.api.prefilledActions.prepareForm, { id })
    expect((await row()).fields[0]).toMatchObject({ answer: "Samantha Lee", source: "saved" })
  })
})

describe("sending an answer to the open browser", () => {
  const openBrowser = async () => {
    const s = await setup()
    await s.t.action(internal.api.prefilledActions.prepareForm, { id: s.id })
    mocks.interact.mockResolvedValueOnce({ value: form, liveUrl: "" }).mockResolvedValueOnce({
      value: { unfilled: [], errors: [] },
      liveUrl: "https://live.example/x",
    })
    await s.as.action(api.api.prefilledActions.startLive, { id: s.id })
    mocks.interact.mockClear()
    mocks.interact.mockResolvedValue({ value: { unfilled: [], errors: [] }, liveUrl: "" })
    return s
  }

  it("fills that one question and points at it, and counts the credit", async () => {
    const { as, id, row } = await openBrowser()
    const before = (await row()).credits ?? 0
    await as.mutation(api.api.prefilled.setAnswer, { id, question: "Why us?", answer: "Edited." })
    expect(
      await as.action(api.api.prefilledActions.sendToForm, { id, question: "Why us?" })
    ).toEqual({
      filled: true,
    })
    const script = mocks.interact.mock.calls[0]![1] as string
    expect(script).toContain("Edited.")
    expect(script).toContain('"show":"#why"')
    expect(script).not.toContain("+1 555 0100")
    expect((await row()).credits).toBe(before + 1)
  })

  it("marks each answer by what happened when the browser opened", async () => {
    const { row } = await openBrowser()
    const fields = (await row()).fields
    expect(fields.find((f) => f.question === "Phone")?.fill).toBe("filled")
    expect(fields.find((f) => f.question === "Why us?")?.fill).toBe("filled")
  })

  it("marks an answer that wouldn't go in, and a blank required one, as by hand", async () => {
    const s = await setup()
    mocks.generateText.mockResolvedValue({ text: '{"answers":[""]}' })
    await s.t.action(internal.api.prefilledActions.prepareForm, { id: s.id })
    mocks.interact.mockResolvedValueOnce({ value: form, liveUrl: "" }).mockResolvedValueOnce({
      value: { unfilled: [{ label: "Phone", reason: "no" }], errors: [] },
      liveUrl: "https://live.example/x",
    })
    await s.as.action(api.api.prefilledActions.startLive, { id: s.id })
    const opened = await s.row()
    expect(opened.fields.map((f) => f.fill)).toEqual(["byHand", "byHand"])
    expect(opened.unfilled).toEqual(expect.arrayContaining(["Phone", "Why us?"]))
  })

  it("clears the mark when an answer changes, and takes it off the by-hand list once sent", async () => {
    const { as, id, row } = await openBrowser()
    const why = async () => (await row()).fields.find((f) => f.question === "Why us?")
    await as.mutation(api.api.prefilled.setAnswer, { id, question: "Why us?", answer: "It fits." })
    expect((await why())?.fill).toBe("filled")

    await as.mutation(api.api.prefilled.setAnswer, { id, question: "Why us?", answer: "Edited." })
    expect((await why())?.fill).toBeUndefined()

    mocks.interact.mockResolvedValueOnce({
      value: { unfilled: [{ label: "Why us?", reason: "no" }], errors: [] },
      liveUrl: "",
    })
    expect(
      await as.action(api.api.prefilledActions.sendToForm, { id, question: "Why us?" })
    ).toEqual({
      filled: false,
    })
    expect((await why())?.fill).toBe("byHand")
    expect((await row()).unfilled).toContain("Why us?")

    await as.action(api.api.prefilledActions.sendToForm, { id, question: "Why us?" })
    expect((await why())?.fill).toBe("filled")
    expect((await row()).unfilled).not.toContain("Why us?")
  })

  it("leaves the mark alone when it only points at a blank question", async () => {
    const { as, id, row } = await openBrowser()
    await as.mutation(api.api.prefilled.setAnswer, { id, question: "Why us?", answer: "" })
    expect(
      await as.action(api.api.prefilledActions.sendToForm, { id, question: "Why us?" })
    ).toEqual({
      filled: false,
    })
    expect((await row()).fields.find((f) => f.question === "Why us?")?.fill).toBeUndefined()
  })

  it("says so when a question isn't in the form, and refuses someone else", async () => {
    const { t, as, id } = await openBrowser()
    await expect(
      as.action(api.api.prefilledActions.sendToForm, { id, question: "Gone" })
    ).rejects.toThrow("can't find that question")
    const other = await t.run((ctx) => ctx.db.insert("users", { name: "Other" }))
    await expect(
      t
        .withIdentity({ subject: other })
        .action(api.api.prefilledActions.sendToForm, { id, question: "Why us?" })
    ).rejects.toThrow("That isn't yours.")
  })

  it("won't send once the browser has closed", async () => {
    const { as, id } = await openBrowser()
    await as.action(api.api.prefilledActions.cancelLive, { id })
    await expect(
      as.action(api.api.prefilledActions.sendToForm, { id, question: "Why us?" })
    ).rejects.toThrow("This browser has closed.")
  })
})

describe("a Greenhouse role listed on the company's own site", () => {
  it("reads Greenhouse's form, and keeps the company's link on the row", async () => {
    const { t, as } = await setup()
    const url = "https://www.hooli.com/careers/positions/8333273?gh_jid=8333273"
    const embed = "https://job-boards.greenhouse.io/embed/job_app?for=hooli&token=8333273"
    const jobId = await t.run(async (ctx) => {
      const job = await ctx.db.query("jobs").first()
      const { _id, _creationTime, ...rest } = job!
      return ctx.db.insert("jobs", { ...rest, url, urlKey: url })
    })
    const id = await as.mutation(api.api.prefilled.prepare, { jobId })
    await t.action(internal.api.prefilledActions.prepareForm, { id })
    expect(mocks.scrape).toHaveBeenCalledWith(embed)
    expect(mocks.scrape).not.toHaveBeenCalledWith(url)
    // The live browser opens whatever the plan says, too.
    expect(await t.query(internal.api.prefilled.plan, { id })).toMatchObject({ url: embed })
    expect(await t.run((ctx) => ctx.db.get("prefills", id))).toMatchObject({ url })
  })
})
