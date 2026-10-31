// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import rateLimiter from "@convex-dev/rate-limiter/test"
import workpool from "@convex-dev/workpool/test"
import { convexTest } from "convex-test"
import { describe, expect, it, vi } from "vite-plus/test"

import { api, internal } from "../../_generated/api"
import type { Id } from "../../_generated/dataModel"
import notificationsSchema from "../../components/notifications/schema"
import schema from "../../schema"
import { deleteApplication } from "../applications/utils"
import { prepareFits } from "./utils"

const modules = import.meta.glob([
  "../../**/*.ts",
  "!../../components/notifications/**",
  "!../../components/cloudflareEmail/**",
  "!../../**/*.test.ts",
])

const field = (question: string, more = {}) => ({
  question,
  type: "text",
  required: true,
  source: "none" as const,
  ...more,
})

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
  const { userId, jobId, fieldId } = await t.run(async (ctx) => {
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
      text: "Frontend Engineer\n\nBuild the web app.",
    })
    const resumeId = await ctx.storage.store(new Blob(["%PDF-1.4"], { type: "application/pdf" }))
    await ctx.db.insert("preferences", { userId, workMode: "any", resumeId, resumeName: "cv.pdf" })
    const fieldId = await ctx.db.insert("profileEntries", {
      userId,
      kind: "field",
      group: "Contact",
      key: "field",
      label: "Phone",
      value: "+1 555 0100",
      order: 2,
    })
    return { userId, jobId, fieldId }
  })
  const as = t.withIdentity({ subject: userId })
  const prepared = async (fields: Parameters<typeof field>[0][] = []) => {
    const id = await as.mutation(api.api.prefilled.prepare, { jobId })
    await t.mutation(internal.api.prefilled.savePrepared, {
      id,
      fields: fields.map((q) => field(q)),
      credits: 2,
    })
    return id
  }
  return { t, as, userId, jobId, fieldId, prepared }
}

const lead = (userId: Id<"users">, n: number, url: string) => ({
  userId,
  url,
  urlKey: `${url}#${n}`,
  title: `Role ${n}`,
  company: "Hooli",
  snippet: "",
  fit: 80,
  reasons: ["Fits."],
  status: "new" as const,
})

describe("preparing an application", () => {
  it("makes one row per posting, however many times it's asked", async () => {
    const { t, as, jobId } = await setup()
    const id = await as.mutation(api.api.prefilled.prepare, { jobId })
    expect(await as.mutation(api.api.prefilled.prepare, { jobId })).toBe(id)
    expect(await t.run((ctx) => ctx.db.query("prefills").collect())).toHaveLength(1)
    const [row] = await as.query(api.api.prefilled.list)
    expect([row?.status, row?.company]).toEqual(["preparing", "Hooli"])
  })

  it("needs a resume first", async () => {
    const { t, as, jobId, userId } = await setup()
    await t.run(async (ctx) => {
      const row = await ctx.db
        .query("preferences")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .unique()
      await ctx.db.patch("preferences", row!._id, { resumeId: undefined })
    })
    await expect(as.mutation(api.api.prefilled.prepare, { jobId })).rejects.toThrow(
      "Upload a resume on the Resume page first."
    )
  })

  it("says what it needs from you, and is ready once you've answered", async () => {
    const { as, prepared } = await setup()
    const id = await prepared(["Why this role?"])
    expect((await as.query(api.api.prefilled.get, { id }))?.prefill.status).toBe("needsAnswers")
    await as.mutation(api.api.prefilled.setAnswer, { id, question: "Why this role?", answer: "  Fit " })
    const row = (await as.query(api.api.prefilled.get, { id }))!.prefill
    expect(row.status).toBe("ready")
    expect(row.fields[0]).toMatchObject({ answer: "Fit", source: "you" })
  })

  it("keeps an answer for future forms only when asked, and only once", async () => {
    const { t, as, prepared, userId } = await setup()
    const id = await prepared(["Why this role?", "Portfolio"])
    await as.mutation(api.api.prefilled.setAnswer, { id, question: "Portfolio", answer: "site.dev" })
    await as.mutation(api.api.prefilled.setAnswer, {
      id,
      question: "Why this role?",
      answer: "One",
      keep: true,
    })
    await as.mutation(api.api.prefilled.setAnswer, {
      id,
      question: "Why this role?",
      answer: "Two",
      keep: true,
    })
    const saved = await t.run((ctx) =>
      ctx.db
        .query("profileEntries")
        .withIndex("by_userId_and_kind_and_order", (q) =>
          q.eq("userId", userId).eq("kind", "field")
        )
        .collect()
    )
    expect(
      saved.filter((e) => e.group === "Your questions").map((e) => [e.label, e.value])
    ).toEqual([["Why this role?", "Two"]])
    expect(saved.some((e) => e.label === "Portfolio")).toBe(false)
  })

  it("refuses an option the form doesn't offer", async () => {
    const { t, as, jobId } = await setup()
    const id = await as.mutation(api.api.prefilled.prepare, { jobId })
    await t.mutation(internal.api.prefilled.savePrepared, {
      id,
      fields: [field("Sponsorship?", { options: ["Yes", "No"] })],
      credits: 0,
    })
    await expect(
      as.mutation(api.api.prefilled.setAnswer, { id, question: "Sponsorship?", answer: "Maybe" })
    ).rejects.toThrow("Pick one of the form's options.")
  })

  it("keeps what you typed when the form is read again", async () => {
    const { t, as, prepared } = await setup()
    const id = await prepared(["Why this role?"])
    await as.mutation(api.api.prefilled.setAnswer, { id, question: "Why this role?", answer: "Mine" })
    await as.mutation(api.api.prefilled.prepareAgain, { id })
    await t.mutation(internal.api.prefilled.savePrepared, {
      id,
      fields: [field("Why this role?")],
      credits: 2,
    })
    const row = (await as.query(api.api.prefilled.get, { id }))!.prefill
    expect(row.fields[0]).toMatchObject({ answer: "Mine", source: "you" })
    expect(row.credits).toBe(4)
    expect(await as.query(api.api.inbox.inbox)).toHaveLength(1)
  })

  it("keeps a draft when the form is read again, until a saved answer covers it", async () => {
    const { t, as, jobId } = await setup()
    const id = await as.mutation(api.api.prefilled.prepare, { jobId })
    await t.mutation(internal.api.prefilled.savePrepared, {
      id,
      fields: [field("Why us?", { answer: "Drafted.", source: "ai" })],
      credits: 2,
    })
    const again = async (fields: ReturnType<typeof field>[]) => {
      await as.mutation(api.api.prefilled.prepareAgain, { id })
      await t.mutation(internal.api.prefilled.savePrepared, { id, fields, credits: 2 })
      return (await as.query(api.api.prefilled.get, { id }))!.prefill
    }
    const kept = await again([field("Why us?")])
    expect(kept.fields[0]).toMatchObject({ answer: "Drafted.", source: "ai" })
    expect(kept.status).toBe("needsAnswers")

    const covered = await again([field("Why us?", { answer: "Saved.", source: "saved" })])
    expect(covered.fields[0]).toMatchObject({ answer: "Saved.", source: "saved" })
  })

  it("counts a draft as yours once you've saved it", async () => {
    const { t, as, jobId } = await setup()
    const id = await as.mutation(api.api.prefilled.prepare, { jobId })
    await t.mutation(internal.api.prefilled.savePrepared, {
      id,
      fields: [field("Why us?", { answer: "Drafted.", source: "ai" })],
      credits: 2,
    })
    await as.mutation(api.api.prefilled.setAnswer, { id, question: "Why us?", answer: "Drafted." })
    const row = (await as.query(api.api.prefilled.get, { id }))!.prefill
    expect(row.fields[0]).toMatchObject({ answer: "Drafted.", source: "you" })
    expect(row.status).toBe("ready")
  })

  it("marks a prepare that died as failed, and lets you try again", async () => {
    const { t, as, jobId } = await setup()
    const id = await as.mutation(api.api.prefilled.prepare, { jobId })
    await t.mutation(internal.api.prefilled.ended, {
      workId: "w1" as never,
      context: { id },
      result: { kind: "failed", error: "timeout" },
    })
    expect((await as.query(api.api.prefilled.get, { id }))?.prefill.status).toBe("failed")
    await as.mutation(api.api.prefilled.prepareAgain, { id })
    expect((await as.query(api.api.prefilled.get, { id }))?.prefill.status).toBe("preparing")
  })
})

describe("preparing what a loop finds", () => {
  const url = "https://job-boards.greenhouse.io/hooli/jobs/"
  const fits = async (t: Awaited<ReturnType<typeof setup>>["t"], userId: Id<"users">, n: number) =>
    t.run(async (ctx) => {
      const ids = []
      for (let i = 0; i < n; i++)
        ids.push(await ctx.db.insert("jobLeads", lead(userId, i, `${url}${i + 10}`)))
      const leads = await Promise.all(ids.map((id) => ctx.db.get("jobLeads", id)))
      await prepareFits(
        ctx,
        userId,
        leads.filter((l) => l !== null)
      )
      return (await ctx.db.query("prefills").collect()).length
    })

  it("does nothing with the switch off", async () => {
    const { t, userId } = await setup()
    expect(await fits(t, userId, 2)).toBe(0)
  })

  it("prepares each fit once, up to the day's budget, skipping boards it can't read", async () => {
    const { t, as, userId } = await setup()
    await as.mutation(api.api.prefilled.setAutoPrepare, { on: true })
    expect(await fits(t, userId, 12)).toBe(10)
    const other = await t.run(async (ctx) => {
      const id = await ctx.db.insert("jobLeads", lead(userId, 99, "https://example.com/careers/1"))
      const row = await ctx.db.get("jobLeads", id)
      await prepareFits(ctx, userId, [row!])
      return (await ctx.db.query("prefills").collect()).length
    })
    expect(other).toBe(10)
  })
})

describe("applying with you there", () => {
  const live = async (s: Awaited<ReturnType<typeof setup>>, id: Id<"prefills">) => {
    await s.t.mutation(internal.api.prefilled.beginLive, { userId: s.userId, id })
    await s.t.mutation(internal.api.prefilled.goLive, {
      id,
      scrapeId: "s1",
      liveUrl: "https://liveview.example/s1",
      unfilled: [],
      spots: [],
      credits: 3,
    })
  }

  it("shows the browser's address to its owner alone, and never in a list", async () => {
    const s = await setup()
    const id = await s.prepared()
    await live(s, id)
    expect((await s.as.query(api.api.prefilled.get, { id }))?.prefill.liveUrl).toContain("liveview")
    const [row] = await s.as.query(api.api.prefilled.list)
    expect(row).not.toHaveProperty("liveUrl")
    expect(row).not.toHaveProperty("scrapeId")
    const otherId = await s.t.run((ctx) => ctx.db.insert("users", { name: "Other" }))
    const other = s.t.withIdentity({ subject: otherId })
    expect(await other.query(api.api.prefilled.get, { id })).toBeNull()
    await expect(other.mutation(api.api.prefilled.dismiss, { id })).rejects.toThrow("That isn't yours.")
  })

  it("won't open twice or change answers while open", async () => {
    const s = await setup()
    const id = await s.prepared(["Why?"])
    await live(s, id)
    await expect(
      s.t.mutation(internal.api.prefilled.beginLive, { userId: s.userId, id })
    ).rejects.toThrow("already open")
  })

  it("lets you change an answer while the browser is open", async () => {
    const s = await setup()
    const id = await s.prepared(["Why?"])
    await live(s, id)
    await s.as.mutation(api.api.prefilled.setAnswer, { id, question: "Why?", answer: "Because." })
    const row = (await s.as.query(api.api.prefilled.get, { id }))!.prefill
    expect(row.fields[0]).toMatchObject({ answer: "Because.", source: "you" })
    expect(row.status).toBe("live")
  })

  it("makes one application however many times it's confirmed, and stamps saved answers", async () => {
    const s = await setup()
    const id = await s.as.mutation(api.api.prefilled.prepare, { jobId: s.jobId })
    await s.t.mutation(internal.api.prefilled.savePrepared, {
      id,
      fields: [field("Phone", { answer: "+1", source: "saved", entryKey: s.fieldId })],
      credits: 2,
    })
    await live(s, id)
    const sent = { userId: s.userId, id, confirmation: "Thank you for applying", credits: 1 }
    await s.t.mutation(internal.api.prefilled.finish, sent)
    await s.t.mutation(internal.api.prefilled.finish, sent)
    expect(await s.t.run((ctx) => ctx.db.query("applications").collect())).toMatchObject([
      { status: "applied", company: "Hooli", role: "Frontend Engineer", labels: ["Remote"] },
    ])
    const row = (await s.as.query(api.api.prefilled.get, { id }))!.prefill
    expect([row.status, row.liveUrl, row.scrapeId]).toEqual(["applied", undefined, undefined])
    const entry = await s.t.run((ctx) => ctx.db.get("profileEntries", s.fieldId))
    expect(entry?.useCount).toBe(1)
    expect(await s.as.mutation(api.api.prefilled.prepare, { jobId: s.jobId })).toBe(id)
    expect((await s.as.query(api.api.prefilled.get, { id }))?.prefill.status).toBe("applied")
    await expect(s.as.mutation(api.api.prefilled.dismiss, { id })).rejects.toThrow("can't be dismissed")
  })

  it("stays closed, without the link, when its application is deleted", async () => {
    const s = await setup()
    const id = await s.prepared()
    await live(s, id)
    await s.t.mutation(internal.api.prefilled.finish, {
      userId: s.userId,
      id,
      confirmation: "Thank you for applying",
      credits: 1,
    })
    const { applicationId } = (await s.as.query(api.api.prefilled.get, { id }))!.prefill
    await s.t.run(async (ctx) => {
      const application = await ctx.db.get("applications", applicationId!)
      await deleteApplication(ctx, application!)
    })
    const row = (await s.as.query(api.api.prefilled.get, { id }))!.prefill
    expect([row.status, row.applicationId]).toEqual(["applied", undefined])
    expect(await s.as.mutation(api.api.prefilled.prepare, { jobId: s.jobId })).toBe(id)
  })

  it("goes back to waiting when the browser closes, unless it's a newer one", async () => {
    const s = await setup()
    const id = await s.prepared()
    await live(s, id)
    await s.t.mutation(internal.api.prefilled.endLive, { id, scrapeId: "older" })
    expect((await s.as.query(api.api.prefilled.get, { id }))?.prefill.status).toBe("live")
    await s.t.mutation(internal.api.prefilled.endLive, { id, scrapeId: "s1", error: "Closed." })
    const row = (await s.as.query(api.api.prefilled.get, { id }))!.prefill
    expect([row.status, row.liveUrl, row.error]).toEqual(["ready", undefined, "Closed."])
  })

  it("shows up in the Inbox when it's ready", async () => {
    const s = await setup()
    await s.prepared(["Why?"])
    const [line] = await s.as.query(api.api.inbox.inbox)
    expect(line).toMatchObject({
      title: "Frontend Engineer · Hooli",
      link: "/prefilled",
      message: "Prepared. 1 question needs you.",
    })
  })
})
