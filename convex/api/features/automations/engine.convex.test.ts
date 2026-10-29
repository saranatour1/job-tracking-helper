// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import aggregate from "@convex-dev/aggregate/test"
import rateLimiter from "@convex-dev/rate-limiter/test"
import workflow from "@convex-dev/workflow/test"
import { convexTest } from "convex-test"
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test"

import { api, components, internal } from "../../../_generated/api"
import notificationsSchema from "../../../notifications/schema"
import { insertRun, patchRun } from "./counts"
import schema from "../../../schema"

// A run's history, in step order.
const byPlace = <T extends { at: string }>(log: T[] | undefined) =>
  [...(log ?? [])].sort((a, b) => a.at.localeCompare(b.at))

// The app's functions, without the local components' own folders or the tests.
const modules = import.meta.glob([
  "../../../**/*.ts",
  "!../../../notifications/**",
  "!../../../cloudflareEmail/**",
  "!../../../**/*.test.ts",
])

const setup = async () => {
  const t = convexTest(schema, modules)
  // The helpers are typed against another copy of convex in the pnpm store.
  workflow.register(t as never)
  rateLimiter.register(t as never)
  aggregate.register(t as never, "automationRunCounts")
  t.registerComponent(
    "notifications",
    notificationsSchema,
    import.meta.glob("../../../notifications/**/*.ts")
  )
  const { userId, applicationId } = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { name: "Sam" })
    const applicationId = await ctx.db.insert("applications", {
      userId,
      role: "UI Engineer",
      company: "Hooli",
      status: "applied",
      priority: "none",
      labels: [],
      method: "Company site",
      location: "",
      description: "",
      history: [],
    } as never)
    return { userId, applicationId }
  })
  const as = t.withIdentity({ subject: userId })
  return { t, as, userId, applicationId }
}

describe("a workflow run", () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it("runs each step in order, waits, and keeps a history", async () => {
    const { t, as, userId, applicationId } = await setup()
    const id = await as.mutation(api.automations.save, {
      name: "Nudge",
      trigger: { kind: "manual" },
      active: true,
      steps: [
        { kind: "addNote", applicationId, text: "Follow up with {application.company}" },
        { kind: "wait", minutes: 60 },
        { kind: "notify", message: "{workflow.name} is done" },
      ],
    })
    const runId = await as.mutation(api.automations.runNow, { id })
    await t.finishAllScheduledFunctions(vi.runAllTimers)

    const run = await t.run((ctx) => ctx.db.get("automationRuns", runId))
    expect(run?.status).toBe("done")
    expect(byPlace(run?.log).map((e) => [e.at, e.kind, e.status])).toEqual([
      ["0", "addNote", "done"],
      ["1", "wait", "done"],
      ["2", "notify", "done"],
    ])
    expect(byPlace(run?.log)[2]?.output).toBe("Nudge is done")
    const application = await t.run((ctx) => ctx.db.get("applications", applicationId))
    expect(application?.notes?.map((n) => n.text)).toEqual(["Follow up with Hooli"])
    const inbox = await t.run((ctx) =>
      ctx.runQuery(components.notifications.lib.list, { owner: userId })
    )
    expect(inbox.map((n) => n.kind)).toEqual(["automation.notify"])
  })

  it("fails the run, with a reason, when a step can't run", async () => {
    const { t, as, applicationId } = await setup()
    const id = await as.mutation(api.automations.save, {
      name: "Note",
      trigger: { kind: "manual" },
      active: true,
      steps: [{ kind: "addNote", applicationId, text: "Hi" }],
    })
    await t.run((ctx) => ctx.db.delete("applications", applicationId))
    const runId = await as.mutation(api.automations.runNow, { id })
    await t.finishAllScheduledFunctions(vi.runAllTimers)

    const run = await t.run((ctx) => ctx.db.get("automationRuns", runId))
    expect(run?.status).toBe("failed")
    expect(run?.error).toBe("That application is gone.")
    expect(run?.log[0]).toMatchObject({ at: "0", kind: "addNote", status: "failed" })
  })

  it("keeps a run's steps when the workflow is edited, and stops on request", async () => {
    const { t, as } = await setup()
    const steps = [
      { kind: "wait" as const, minutes: 60 },
      { kind: "notify" as const, message: "Late" },
    ]
    const id = await as.mutation(api.automations.save, {
      name: "Slow",
      trigger: { kind: "manual" },
      active: true,
      steps,
    })
    const runId = await as.mutation(api.automations.runNow, { id })
    await as.mutation(api.automations.save, {
      id,
      name: "Slow",
      trigger: { kind: "manual" },
      active: true,
      steps: [{ kind: "notify", message: "Edited" }],
    })
    // Let it reach the wait, then stop it there.
    for (let i = 0; i < 10; i++) {
      vi.runOnlyPendingTimers()
      await t.finishInProgressScheduledFunctions()
      const waiting = await t.run((ctx) => ctx.db.get("automationRuns", runId))
      if (waiting?.log.some((e) => e.status === "waiting")) break
    }
    await as.mutation(api.automations.stopRun, { runId })
    await t.finishAllScheduledFunctions(vi.runAllTimers)
    const run = await t.run((ctx) => ctx.db.get("automationRuns", runId))
    expect(run?.steps).toEqual(steps)
    expect(run?.status).toBe("canceled")
    expect(run?.log).toMatchObject([{ at: "0", kind: "wait", status: "failed", error: "Stopped." }])
  })

  it("runs paths side by side, then goes on, and counts how runs ended", async () => {
    const { t, as, applicationId } = await setup()
    const id = await as.mutation(api.automations.save, {
      name: "Split",
      trigger: { kind: "manual" },
      active: true,
      steps: [
        {
          kind: "parallel",
          paths: [
            { label: "Note", steps: [{ kind: "addNote", applicationId, text: "A" }] },
            {
              label: "Later",
              steps: [
                { kind: "wait", minutes: 5 },
                { kind: "notify", message: "B" },
              ],
            },
          ],
        },
        { kind: "notify", message: "After" },
      ],
    })
    const runId = await as.mutation(api.automations.runNow, { id })
    await t.finishAllScheduledFunctions(vi.runAllTimers)
    const run = await t.run((ctx) => ctx.db.get("automationRuns", runId))
    expect(run?.status).toBe("done")
    expect(byPlace(run?.log).map((e) => [e.at, e.status])).toEqual([
      ["0", "done"],
      ["0.0.0", "done"],
      ["0.1.0", "done"],
      ["0.1.1", "done"],
      ["1", "done"],
    ])

    await t.run((ctx) => ctx.db.delete("applications", applicationId))
    await as.mutation(api.automations.runNow, { id })
    await t.finishAllScheduledFunctions(vi.runAllTimers)
    expect(await as.query(api.automations.counts, { automationId: id })).toEqual({
      running: 0,
      done: 1,
      failed: 1,
      canceled: 0,
    })
  })

  it("lets one path run on while another waits", async () => {
    const { t, as } = await setup()
    const id = await as.mutation(api.automations.save, {
      name: "Independent",
      trigger: { kind: "manual" },
      active: true,
      steps: [
        {
          kind: "parallel",
          paths: [
            { label: "Slow", steps: [{ kind: "wait", minutes: 60 }] },
            {
              label: "Quick",
              steps: [
                { kind: "notify", message: "One" },
                { kind: "notify", message: "Two" },
                { kind: "notify", message: "Three" },
              ],
            },
          ],
        },
      ],
    })
    const runId = await as.mutation(api.automations.runNow, { id })
    // Move time on by seconds, not the hour the slow path waits.
    const statusAt = async (at: string) =>
      (await t.run((ctx) => ctx.db.get("automationRuns", runId)))?.log.find((e) => e.at === at)
        ?.status
    for (let i = 0; i < 40 && (await statusAt("0.1.2")) !== "done"; i++) {
      vi.advanceTimersByTime(1000)
      await t.finishInProgressScheduledFunctions()
    }
    expect(await statusAt("0.1.2")).toBe("done")
    expect(await statusAt("0.0.0")).toBe("waiting")

    await t.finishAllScheduledFunctions(vi.runAllTimers)
    const run = await t.run((ctx) => ctx.db.get("automationRuns", runId))
    expect(run?.status).toBe("done")
  })

  it("stops every path when a run is stopped mid-split", async () => {
    const { t, as } = await setup()
    const id = await as.mutation(api.automations.save, {
      name: "Stopped",
      trigger: { kind: "manual" },
      active: true,
      steps: [
        {
          kind: "parallel",
          paths: [
            {
              label: "Slow",
              steps: [
                { kind: "wait", minutes: 60 },
                { kind: "notify", message: "Late" },
              ],
            },
            { label: "Quick", steps: [{ kind: "notify", message: "Now" }] },
          ],
        },
        { kind: "notify", message: "After" },
      ],
    })
    const runId = await as.mutation(api.automations.runNow, { id })
    const statusAt = async (at: string) =>
      (await t.run((ctx) => ctx.db.get("automationRuns", runId)))?.log.find((e) => e.at === at)
        ?.status
    for (let i = 0; i < 40 && (await statusAt("0.0.0")) !== "waiting"; i++) {
      vi.advanceTimersByTime(1000)
      await t.finishInProgressScheduledFunctions()
    }
    await as.mutation(api.automations.stopRun, { runId })
    await t.finishAllScheduledFunctions(vi.runAllTimers)
    const run = await t.run((ctx) => ctx.db.get("automationRuns", runId))
    expect(run?.status).toBe("canceled")
    expect(run?.log.map((e) => e.at).sort()).not.toContain("0.0.1")
    expect(run?.log.map((e) => e.at)).not.toContain("1")
  })

  it("starts due schedules even with many manual workflows switched on", async () => {
    const { t, userId } = await setup()
    // More active manual workflows than the cron takes in one batch.
    const due = await t.run(async (ctx) => {
      for (let i = 0; i < 60; i++)
        await ctx.db.insert("automations", {
          userId,
          name: `Manual ${i}`,
          trigger: { kind: "manual" },
          steps: [{ kind: "notify", message: "Hi" }],
          active: true,
        })
      return ctx.db.insert("automations", {
        userId,
        name: "Morning",
        trigger: { kind: "schedule", at: "09:00", days: [0, 1, 2, 3, 4, 5, 6], timeZone: "UTC" },
        steps: [{ kind: "notify", message: "Hi" }],
        active: true,
        nextRunAt: Date.now() - 1000,
      })
    })
    expect(await t.mutation(internal.automations.startDue, {})).toBe(1)
    const runs = await t.run((ctx) =>
      ctx.db
        .query("automationRuns")
        .withIndex("by_automationId_and_startedAt", (q) => q.eq("automationId", due))
        .collect()
    )
    expect(runs.map((r) => r.trigger)).toEqual(["schedule"])
    const after = await t.run((ctx) => ctx.db.get("automations", due))
    expect(after?.nextRunAt).toBeGreaterThan(Date.now())
  })

  it("stops a run whose workflow already ended without a word back", async () => {
    const { t, as } = await setup()
    const id = await as.mutation(api.automations.save, {
      name: "Quick",
      trigger: { kind: "manual" },
      active: true,
      steps: [{ kind: "notify", message: "Hi" }],
    })
    const runId = await as.mutation(api.automations.runNow, { id })
    await t.finishAllScheduledFunctions(vi.runAllTimers)
    // As if the completion handler had failed: the workflow is over, the run says running.
    await t.run(async (ctx) => {
      const run = await ctx.db.get("automationRuns", runId)
      await patchRun(ctx as never, run!, { status: "running" })
    })
    await as.mutation(api.automations.stopRun, { runId })
    const run = await t.run((ctx) => ctx.db.get("automationRuns", runId))
    expect(run?.status).toBe("canceled")
    await as.mutation(api.automations.remove, { id })
    expect(await t.run((ctx) => ctx.db.get("automations", id))).toBeNull()
  })

  it("deletes a workflow with its runs and their Inbox lines", async () => {
    const { t, as, userId } = await setup()
    const id = await as.mutation(api.automations.save, {
      name: "Ping",
      trigger: { kind: "manual" },
      active: true,
      steps: [{ kind: "notify", message: "Hi" }],
    })
    await as.mutation(api.automations.runNow, { id })
    await t.finishAllScheduledFunctions(vi.runAllTimers)
    const inbox = () =>
      t.run((ctx) => ctx.runQuery(components.notifications.lib.list, { owner: userId }))
    expect(await inbox()).toHaveLength(1)
    await as.mutation(api.automations.remove, { id })
    expect(await inbox()).toHaveLength(0)
    expect(await t.run((ctx) => ctx.db.query("automationRuns").collect())).toHaveLength(0)
  })

  it("keeps the newest 50 runs of a workflow", async () => {
    const { t, as, userId } = await setup()
    const id = await as.mutation(api.automations.save, {
      name: "Busy",
      trigger: { kind: "manual" },
      active: true,
      steps: [{ kind: "notify", message: "Hi" }],
    })
    await t.run(async (ctx) => {
      for (let i = 0; i < 55; i++)
        await insertRun(ctx as never, {
          automationId: id,
          userId,
          name: "Busy",
          trigger: "manual",
          steps: [],
          status: "done",
          startedAt: i,
          log: [],
        })
    })
    await as.mutation(api.automations.runNow, { id })
    const runs = await t.run((ctx) => ctx.db.query("automationRuns").collect())
    expect(runs).toHaveLength(50)
    expect(Math.min(...runs.map((r) => r.startedAt))).toBe(6)
    const counts = await as.query(api.automations.counts, { automationId: id })
    expect(counts.done + counts.running).toBe(50)
  })

  it("won't save someone else's application into a step", async () => {
    const { t, applicationId } = await setup()
    const otherId = await t.run((ctx) => ctx.db.insert("users", { name: "Alex" }))
    const other = t.withIdentity({ subject: otherId })
    await expect(
      other.mutation(api.automations.save, {
        name: "Snoop",
        trigger: { kind: "manual" },
        active: true,
        steps: [{ kind: "addNote", applicationId, text: "Hi" }],
      })
    ).rejects.toThrow("That application isn't yours.")
  })
})
