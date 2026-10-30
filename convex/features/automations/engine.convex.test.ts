// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import aggregate from "@convex-dev/aggregate/test"
import rateLimiter from "@convex-dev/rate-limiter/test"
import workflow from "@convex-dev/workflow/test"
import { convexTest } from "convex-test"
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test"

import { api, components, internal } from "../../_generated/api"

// Jev, answered from the test: the path key it picks ("p0", "p1"), or a throw.
const jev = vi.hoisted(() => ({ choice: "p0" as string | Error }))
vi.mock("ai", async (actual) => ({
  ...(await actual<typeof import("ai")>()),
  experimental_decide: async () => {
    if (jev.choice instanceof Error) throw jev.choice
    return { answers: { answer: { choice: jev.choice } } }
  },
}))
import notificationsSchema from "../../components/notifications/schema"
import { seal } from "../../lib/secrets"
import { aad, keys } from "../email/utils"
import { choiceCounts, insertRun, patchRun } from "./counts"
import schema from "../../schema"

// A run's history, in step order.
const byPlace = <T extends { at: string }>(log: T[] | undefined) =>
  [...(log ?? [])].sort((a, b) => a.at.localeCompare(b.at))

// The app's functions, without the local components' own folders or the tests.
const modules = import.meta.glob([
  "../../**/*.ts",
  "!../../components/notifications/**",
  "!../../components/cloudflareEmail/**",
  "!../../**/*.test.ts",
])

const setup = async () => {
  const t = convexTest(schema, modules)
  // The helpers are typed against another copy of convex in the pnpm store.
  workflow.register(t as never)
  rateLimiter.register(t as never)
  aggregate.register(t as never, "automationRunCounts")
  aggregate.register(t as never, "automationChoices")
  t.registerComponent(
    "notifications",
    notificationsSchema,
    import.meta.glob("../../components/notifications/**/*.ts")
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
    ).rejects.toThrow("That application isn't yours, or it's gone.")
  })

  it("starts on a status change, about that application", async () => {
    const { t, as, applicationId } = await setup()
    await as.mutation(api.automations.save, {
      name: "Prep",
      trigger: { kind: "status", to: ["interviewing"] },
      active: true,
      steps: [{ kind: "addNote", text: "{status.from} → {status.to} at {application.company}" }],
    })
    await as.mutation(api.applications.setStatus, { id: applicationId, status: "rejected" })
    await as.mutation(api.applications.setStatus, { id: applicationId, status: "interviewing" })
    await t.finishAllScheduledFunctions(vi.runAllTimers)

    const runs = await t.run((ctx) => ctx.db.query("automationRuns").collect())
    expect(runs.map((r) => [r.trigger, r.context?.to])).toEqual([["event", "interviewing"]])
    const application = await t.run((ctx) => ctx.db.get("applications", applicationId))
    expect(application?.notes?.map((n) => n.text)).toEqual(["Rejected → Interviewing at Hooli"])
  })

  it("moves an application without starting itself again", async () => {
    const { t, as, applicationId } = await setup()
    await as.mutation(api.automations.save, {
      name: "Bounce",
      trigger: { kind: "status", to: [] },
      active: true,
      steps: [{ kind: "move", to: "offer" }],
    })
    await as.mutation(api.applications.setStatus, { id: applicationId, status: "interviewing" })
    await t.finishAllScheduledFunctions(vi.runAllTimers)

    const runs = await t.run((ctx) => ctx.db.query("automationRuns").collect())
    expect(runs.map((r) => r.status)).toEqual(["done"])
    const application = await t.run((ctx) => ctx.db.get("applications", applicationId))
    expect(application?.status).toBe("offer")
  })

  it("starts when an application joins a goal, and can put one on a goal", async () => {
    const { t, as, userId, applicationId } = await setup()
    const goalId = await t.run((ctx) =>
      ctx.db.insert("goals", {
        userId,
        name: "Land a role",
        summary: "",
        priority: "high",
        start: "2026-01-01",
        target: "2026-12-31",
        milestones: [],
      })
    )
    const otherGoal = await t.run((ctx) =>
      ctx.db.insert("goals", {
        userId,
        name: "Side quests",
        summary: "",
        priority: "low",
        start: "2026-01-01",
        target: "2026-12-31",
        milestones: [],
      })
    )
    await as.mutation(api.automations.save, {
      name: "On goal",
      trigger: { kind: "goal", goals: [goalId] },
      active: true,
      steps: [
        { kind: "addNote", text: "{application.company} joined {goal.name}" },
        { kind: "putOnGoal", goalId: otherGoal },
      ],
    })
    await as.mutation(api.applications.setGoal, { id: applicationId, goalId })
    await t.finishAllScheduledFunctions(vi.runAllTimers)

    const runs = await t.run((ctx) => ctx.db.query("automationRuns").collect())
    expect(runs.map((r) => [r.status, r.context?.goalId])).toEqual([["done", goalId]])
    const application = await t.run((ctx) => ctx.db.get("applications", applicationId))
    expect(application?.notes?.map((n) => n.text)).toEqual(["Hooli joined Land a role"])
    // The step's move onto the other goal starts nothing: one run in all.
    expect(application?.goalId).toBe(otherGoal)
  })

  it("runs only the path Jev picks, and counts its answers", async () => {
    const { t, as, userId } = await setup()
    const id = await as.mutation(api.automations.save, {
      name: "Ask",
      trigger: { kind: "manual" },
      active: true,
      steps: [
        {
          kind: "decide",
          question: "Worth it?",
          paths: [
            { label: "Yes", steps: [{ kind: "notify", message: "yes" }] },
            { label: "No", steps: [] },
          ],
        },
        { kind: "notify", message: "after" },
      ],
    })
    jev.choice = "p0"
    await as.mutation(api.automations.runNow, { id })
    await t.finishAllScheduledFunctions(vi.runAllTimers)
    jev.choice = "p1"
    await as.mutation(api.automations.runNow, { id })
    await t.finishAllScheduledFunctions(vi.runAllTimers)

    const runs = await t.run((ctx) => ctx.db.query("automationRuns").collect())
    expect(runs.map((r) => r.status)).toEqual(["done", "done"])
    expect(byPlace(runs[0]?.log).map((e) => [e.at, e.status, e.choice])).toEqual([
      ["0", "done", "Yes"],
      ["0.0.0", "done", undefined],
      ["1", "done", undefined],
    ])
    expect(byPlace(runs[1]?.log).map((e) => e.at)).toEqual(["0", "1"])
    const inbox = await t.run((ctx) =>
      ctx.runQuery(components.notifications.lib.list, { owner: userId })
    )
    expect(inbox).toHaveLength(3)
    expect(await as.query(api.automations.choices, { automationId: id })).toEqual({
      "0": { Yes: 1, No: 1 },
    })
  })

  it("starts on a sorted email of a kind it watches, and opens its words for a step", async () => {
    vi.stubEnv("SECRETS_KEYS", `v1:${btoa(String.fromCharCode(...new Uint8Array(32).fill(7)))}`)
    const { t, as, userId, applicationId } = await setup()
    await as.mutation(api.automations.save, {
      name: "Interviews",
      trigger: { kind: "mail", kinds: ["interview"] },
      active: true,
      steps: [{ kind: "addNote", text: "{email.from} wrote: {email.subject} ({email.kind})" }],
    })
    const mail = async (emailId: string, kind: "interview" | "rejection", subject: string) =>
      t.mutation(internal.email.record, {
        event: {
          userId,
          emailId,
          applicationId,
          kind,
          note: await seal(
            await keys(),
            JSON.stringify({ from: "Ana at Hooli", subject }),
            aad.email(userId)
          ),
          at: Date.now(),
          by: "rules",
        },
        move: false,
      })
    await mail("e1", "rejection", "Thanks, but no")
    await mail("e2", "interview", "Let's talk")
    await t.finishAllScheduledFunctions(vi.runAllTimers)

    const runs = await t.run((ctx) => ctx.db.query("automationRuns").collect())
    expect(runs.map((r) => [r.trigger, r.status])).toEqual([["event", "done"]])
    // The run keeps only ids; the email's words were opened when the note was written.
    expect(JSON.stringify(runs[0]?.context)).not.toContain("Let's talk")
    const application = await t.run((ctx) => ctx.db.get("applications", applicationId))
    expect(application?.notes?.map((n) => n.text)).toEqual([
      "Ana at Hooli wrote: Let's talk (interview)",
    ])
    vi.unstubAllEnvs()
  })

  it("keeps Jev's answer counts with its step when the step moves", async () => {
    const { t, as } = await setup()
    const decide = {
      kind: "decide" as const,
      id: "ask-1",
      question: "Worth it?",
      paths: [
        { label: "Yes", steps: [{ kind: "notify" as const, message: "yes" }] },
        { label: "No", steps: [] },
      ],
    }
    const draft = { name: "Ask", trigger: { kind: "manual" as const }, active: true }
    const id = await as.mutation(api.automations.save, { ...draft, steps: [decide] })
    jev.choice = "p0"
    await as.mutation(api.automations.runNow, { id })
    await t.finishAllScheduledFunctions(vi.runAllTimers)

    // A step added before it moves it from "0" to "1".
    await as.mutation(api.automations.save, {
      id,
      ...draft,
      steps: [{ kind: "notify", message: "first" }, decide],
    })
    expect(await as.query(api.automations.choices, { automationId: id })).toEqual({
      "1": { Yes: 1, No: 0 },
    })
    // Old runs still find their entries to remove.
    const counted = () => t.run((ctx) => choiceCounts.count(ctx as never, { namespace: id }))
    expect(await counted()).toBe(1)
    await as.mutation(api.automations.remove, { id })
    expect(await counted()).toBe(0)
  })

  it("ends a run quietly when an Only go on if doesn't hold", async () => {
    const { t, as, userId, applicationId } = await setup()
    const id = await as.mutation(api.automations.save, {
      name: "Check",
      trigger: { kind: "status", to: [] },
      active: true,
      steps: [
        {
          kind: "parallel",
          paths: [
            {
              label: "Offer only",
              steps: [
                { kind: "onlyIf", fact: "status.to", test: "is", value: "offer" },
                { kind: "notify", message: "offer" },
              ],
            },
            { label: "Always", steps: [{ kind: "notify", message: "always" }] },
          ],
        },
        { kind: "onlyIf", fact: "application.status", test: "is", value: "Offer" },
        { kind: "notify", message: "after" },
      ],
    })
    await as.mutation(api.applications.setStatus, { id: applicationId, status: "interviewing" })
    await t.finishAllScheduledFunctions(vi.runAllTimers)

    const [run] = await t.run((ctx) => ctx.db.query("automationRuns").collect())
    expect(run?.automationId).toBe(id)
    expect(run?.status).toBe("done")
    expect(byPlace(run?.log).map((e) => [e.at, e.status])).toEqual([
      ["0", "done"],
      ["0.0.0", "done"],
      ["0.1.0", "done"],
      ["1", "done"],
    ])
    expect(byPlace(run?.log)[3]?.output).toBe(
      "Stopped here: {application.status} is “Interviewing”"
    )
    const inbox = await t.run((ctx) =>
      ctx.runQuery(components.notifications.lib.list, { owner: userId })
    )
    expect(inbox).toHaveLength(1)
  })

  it("stops with Jev's reason when it can't answer", async () => {
    const { t, as } = await setup()
    const id = await as.mutation(api.automations.save, {
      name: "Ask",
      trigger: { kind: "manual" },
      active: true,
      steps: [
        {
          kind: "decide",
          question: "Worth it?",
          paths: [
            { label: "Yes", steps: [{ kind: "notify", message: "yes" }] },
            { label: "No", steps: [] },
          ],
        },
      ],
    })
    jev.choice = new Error("offline")
    const runId = await as.mutation(api.automations.runNow, { id })
    await t.finishAllScheduledFunctions(vi.runAllTimers)
    const run = await t.run((ctx) => ctx.db.get("automationRuns", runId))
    expect(run?.status).toBe("failed")
    expect(run?.log.find((e) => e.at === "0")?.error).toBe("Jev couldn't answer: offline")
  })

  it("finds roles with a loop, and later steps say what it found", async () => {
    const { t, as, userId } = await setup()
    const loopId = await t.run((ctx) =>
      ctx.db.insert("loops", {
        userId,
        name: "Frontend",
        template: "custom",
        answers: {
          usePreferences: true,
          stretch: false,
          remoteOnly: false,
          nearMe: false,
          listedCompanies: false,
          skipRedFlags: true,
          postedToday: false,
        },
        daily: 10,
        at: "08:00",
        timeZone: "UTC",
        active: false,
        nextRunAt: 0,
      })
    )
    const id = await as.mutation(api.automations.save, {
      name: "Search",
      trigger: { kind: "manual" },
      active: true,
      steps: [
        { kind: "findRoles", loopId },
        { kind: "notify", message: "{roles.fits} of {roles.judged} from {loop.name}" },
      ],
    })
    const runId = await as.mutation(api.automations.runNow, { id })
    await t.finishAllScheduledFunctions(vi.runAllTimers)

    const run = await t.run((ctx) => ctx.db.get("automationRuns", runId))
    expect(run?.status).toBe("done")
    expect(byPlace(run?.log).map((e) => [e.at, e.status])).toEqual([
      ["0", "done"],
      ["1", "done"],
    ])
    expect(byPlace(run?.log)[0]?.output).toMatch(/^Jev judged 0 roles: 0 fit\./)
    expect(byPlace(run?.log)[1]?.output).toBe("0 of 0 from Frontend")
    // The loop's own Runs tab shows it too.
    const loopRuns = await t.run((ctx) => ctx.db.query("loopRuns").collect())
    expect(loopRuns.map((r) => [r.loopId, r.status])).toEqual([[loopId, "done"]])
  })

  it("won't save someone else's loop into Find roles", async () => {
    const { t, userId } = await setup()
    const loopId = await t.run((ctx) =>
      ctx.db.insert("loops", {
        userId,
        name: "Mine",
        template: "custom",
        answers: {
          usePreferences: true,
          stretch: false,
          remoteOnly: false,
          nearMe: false,
          listedCompanies: false,
          skipRedFlags: true,
          postedToday: false,
        },
        daily: 10,
        at: "08:00",
        timeZone: "UTC",
        active: false,
        nextRunAt: 0,
      })
    )
    const otherId = await t.run((ctx) => ctx.db.insert("users", { name: "Alex" }))
    await expect(
      t.withIdentity({ subject: otherId }).mutation(api.automations.save, {
        name: "Snoop",
        trigger: { kind: "manual" },
        active: true,
        steps: [{ kind: "findRoles", loopId }],
      })
    ).rejects.toThrow("That loop isn't yours, or it's gone.")
  })

  it("stops Send email when a placeholder doesn't fill in to one address", async () => {
    const { t, as } = await setup()
    const id = await as.mutation(api.automations.save, {
      name: "Mail",
      trigger: { kind: "manual" },
      active: true,
      steps: [{ kind: "sendEmail", to: "{email.from}", subject: "Hi", text: "Hello" }],
    })
    const runId = await as.mutation(api.automations.runNow, { id })
    await t.finishAllScheduledFunctions(vi.runAllTimers)
    const run = await t.run((ctx) => ctx.db.get("automationRuns", runId))
    expect(run?.status).toBe("failed")
    expect(run?.log[0]?.error).toBe("“{email.from}” isn't one email address.")
  })

  it("won't send email without a Cloudflare connection", async () => {
    const { t, as } = await setup()
    const id = await as.mutation(api.automations.save, {
      name: "Mail",
      trigger: { kind: "manual" },
      active: true,
      steps: [{ kind: "sendEmail", to: "sam@example.com", subject: "Hi", text: "Hello" }],
    })
    const runId = await as.mutation(api.automations.runNow, { id })
    await t.finishAllScheduledFunctions(vi.runAllTimers)
    const run = await t.run((ctx) => ctx.db.get("automationRuns", runId))
    expect(run?.status).toBe("failed")
    expect(run?.log[0]).toMatchObject({ output: "To sam@example.com: Hi", status: "failed" })
  })
})
