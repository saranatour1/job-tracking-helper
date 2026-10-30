// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import rateLimiter from "@convex-dev/rate-limiter/test"
import workpool from "@convex-dev/workpool/test"
import { convexTest } from "convex-test"
import { describe, expect, it, vi } from "vite-plus/test"

import { api, internal } from "../../../_generated/api"
import notificationsSchema from "../../../notifications/schema"
import schema from "../../../schema"

const modules = import.meta.glob([
  "../../../**/*.ts",
  "!../../../notifications/**",
  "!../../../cloudflareEmail/**",
  "!../../../**/*.test.ts",
])

const setup = async () => {
  vi.stubEnv("FIRECRAWL_API_KEY", "fc-test")
  const t = convexTest(schema, modules)
  rateLimiter.register(t as never)
  workpool.register(t as never, "applyPool")
  t.registerComponent(
    "notifications",
    notificationsSchema,
    import.meta.glob("../../../notifications/**/*.ts")
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
      text: "",
    })
    const resumeId = await ctx.storage.store(new Blob(["%PDF-1.4"], { type: "application/pdf" }))
    await ctx.db.insert("preferences", { userId, workMode: "any", resumeId })
    const fieldId = await ctx.db.insert("profileEntries", {
      userId,
      kind: "field",
      group: "Contact",
      key: "phone",
      label: "Phone",
      value: "+1 555 0100",
      order: 2,
    })
    return { userId, jobId, fieldId }
  })
  const as = t.withIdentity({ subject: userId })
  return { t, as, userId, jobId, fieldId }
}

describe("auto-apply", () => {
  it("queues a role once the switch is on, and only once per posting", async () => {
    const { t, as, jobId } = await setup()
    await expect(as.mutation(api.autoApply.queue, { jobId })).rejects.toThrow(
      "Turn on auto-apply under Account first."
    )
    await as.mutation(api.autoApply.setSwitch, { on: true, dryRun: true })
    const id = await as.mutation(api.autoApply.queue, { jobId })
    expect(await as.mutation(api.autoApply.queue, { jobId })).toBe(id)
    const [row] = await as.query(api.autoApply.list)
    expect([row?.status, row?.dryRun, row?.company]).toEqual(["queued", true, "Hooli"])
    expect(await t.run((ctx) => ctx.db.query("autoApplies").collect())).toHaveLength(1)
  })

  it("finishes as applied: an application, stamped answers, and an Inbox line", async () => {
    const { t, as, userId, jobId, fieldId } = await setup()
    await as.mutation(api.autoApply.setSwitch, { on: true })
    const id = await as.mutation(api.autoApply.queue, { jobId })
    expect(await t.mutation(internal.autoApply.claim, { autoApplyId: id })).toBe(true)
    expect(await t.mutation(internal.autoApply.claim, { autoApplyId: id })).toBe(false)
    expect(await t.mutation(internal.autoApply.markSubmitting, { autoApplyId: id })).toBe(true)
    expect(await t.mutation(internal.autoApply.markSubmitting, { autoApplyId: id })).toBe(false)
    await t.mutation(internal.autoApply.finish, {
      autoApplyId: id,
      status: "applied",
      used: [
        { key: "user.email", label: "Email" },
        { key: fieldId, label: "Phone" },
      ],
      confirmation: "Thank you for applying",
      credits: 4,
    })
    const row = (await as.query(api.autoApply.list))[0]!
    expect(row.status).toBe("applied")
    const application =
      row.applicationId && (await t.run((ctx) => ctx.db.get("applications", row.applicationId!)))
    expect([
      application?.status,
      application?.company,
      application?.role,
      application?.labels,
    ]).toEqual(["applied", "Hooli", "Frontend Engineer", ["Remote"]])
    const field = await t.run((ctx) => ctx.db.get("profileEntries", fieldId))
    expect(field?.useCount).toBe(1)
    expect(await t.run((ctx) => ctx.db.query("sourceUsage").collect())).toMatchObject([{ used: 4 }])
    // Sent once: the posting can't be queued again.
    await expect(as.mutation(api.autoApply.queue, { jobId })).rejects.toThrow("already sent")
    expect(userId).toBeTruthy()
  })

  it("marks a run that died as failed, and keeps a sent one closed", async () => {
    const { t, as, jobId } = await setup()
    await as.mutation(api.autoApply.setSwitch, { on: true })
    const id = await as.mutation(api.autoApply.queue, { jobId })
    await t.mutation(internal.autoApply.claim, { autoApplyId: id })
    await t.mutation(internal.autoApply.markSubmitting, { autoApplyId: id })
    await t.mutation(internal.autoApply.ended, {
      workId: "w1" as never,
      context: { autoApplyId: id },
      result: { kind: "failed", error: "timeout" },
    })
    const row = (await as.query(api.autoApply.list))[0]!
    expect(row.status).toBe("failed")
    expect(row.error).toMatch(/Check your email/)
    await expect(as.mutation(api.autoApply.retry, { id })).rejects.toThrow("already sent")
  })
})
