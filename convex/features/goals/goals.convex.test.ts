// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { convexTest } from "convex-test"
import { describe, expect, it } from "vite-plus/test"

import { api } from "../../_generated/api"
import schema from "../../schema"

const modules = import.meta.glob([
  "../../**/*.ts",
  "!../../components/notifications/**",
  "!../../components/cloudflareEmail/**",
  "!../../**/*.test.ts",
])

const goal = {
  name: "Land a frontend role",
  summary: "",
  priority: "high" as const,
  start: "2026-09-15",
  target: "2027-03-31",
  milestones: [{ name: "Polish resume", done: false }],
}

const setup = async () => {
  const t = convexTest(schema, modules)
  const userId = await t.run((ctx) => ctx.db.insert("users", { name: "Sam" }))
  const as = t.withIdentity({ subject: userId })
  const addApplication = () =>
    t.run((ctx) =>
      ctx.db.insert("applications", {
        number: 1,
        history: [],
        userId,
        role: "Engineer",
        company: "Hooli",
        status: "applied",
      } as never)
    )
  return { t, as, userId, addApplication }
}

describe("goals", () => {
  it("creates, lists, updates and ticks milestones", async () => {
    const { as } = await setup()
    const id = await as.mutation(api.api.goals.create, goal)
    expect((await as.query(api.api.goals.list)).map((g) => g._id)).toEqual([id])

    await as.mutation(api.api.goals.update, {
      id,
      name: "  Land a role  ",
      milestones: [{ name: "Polish resume", done: true }],
    })
    const [saved] = await as.query(api.api.goals.list)
    expect(saved?.name).toBe("Land a role")
    expect(saved?.milestones[0]?.done).toBe(true)
  })

  it("refuses a blank name and a date that isn't a day", async () => {
    const { as } = await setup()
    await expect(as.mutation(api.api.goals.create, { ...goal, name: "  " })).rejects.toThrow()
    await expect(as.mutation(api.api.goals.create, { ...goal, start: "soon" })).rejects.toThrow()
  })

  it("lets an application join a goal, and leave it when the goal goes", async () => {
    const { t, as, addApplication } = await setup()
    const goalId = await as.mutation(api.api.goals.create, goal)
    const applicationId = await addApplication()

    await as.mutation(api.api.applications.setGoal, { id: applicationId, goalId })
    expect((await t.run((ctx) => ctx.db.get("applications", applicationId)))?.goalId).toBe(goalId)

    await as.mutation(api.api.goals.remove, { id: goalId })
    expect(await as.query(api.api.goals.list)).toEqual([])
    expect((await t.run((ctx) => ctx.db.get("applications", applicationId)))?.goalId).toBe(
      undefined
    )
  })

  it("retries a goal as a fresh one, starting today for the same length", async () => {
    const { as } = await setup()
    const id = await as.mutation(api.api.goals.create, {
      ...goal,
      start: "2026-01-01",
      target: "2026-01-31",
      milestones: [{ name: "Polish resume", done: true, target: "2026-01-10" }],
    })
    const retried = await as.mutation(api.api.goals.retry, { id })
    const goals = await as.query(api.api.goals.list)
    const fresh = goals.find((g) => g._id === retried)
    const today = new Date().toISOString().slice(0, 10)
    expect(goals).toHaveLength(2)
    expect(fresh?.name).toBe(goal.name)
    expect(fresh?.start).toBe(today)
    expect(Date.parse(fresh!.target) - Date.parse(fresh!.start)).toBe(30 * 24 * 60 * 60 * 1000)
    expect(fresh?.milestones).toEqual([
      { name: "Polish resume", done: false, target: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) },
    ])
    expect(Date.parse(fresh!.milestones[0]!.target!) - Date.parse(fresh!.start)).toBe(
      9 * 24 * 60 * 60 * 1000
    )
  })

  it("takes a loop only from its owner, and clears it with null", async () => {
    const { t, as, userId } = await setup()
    const addLoop = (owner: typeof userId, name: string) =>
      t.run((ctx) =>
        ctx.db.insert("loops", {
          show: 5,
          userId: owner,
          name,
          template: "remote",
          answers: {
            usePreferences: true,
            stretch: false,
            remoteOnly: true,
            nearMe: false,
            listedCompanies: false,
            skipRedFlags: true,
            postedToday: false,
          },
          daily: 25,
          at: "08:00",
          timeZone: "UTC",
          active: false,
          nextRunAt: 0,
        })
      )
    const loopId = await addLoop(userId, "Mornings")
    const other = await t.run((ctx) => ctx.db.insert("users", { name: "Ada" }))
    const theirs = await addLoop(other, "Theirs")

    const id = await as.mutation(api.api.goals.create, { ...goal, loopId })
    expect((await as.query(api.api.goals.list))[0]?.loopId).toBe(loopId)
    await expect(as.mutation(api.api.goals.update, { id, loopId: theirs })).rejects.toThrow(
      "That loop isn't yours."
    )
    await as.mutation(api.api.goals.update, { id, loopId: null })
    expect((await as.query(api.api.goals.list))[0]?.loopId).toBe(undefined)
  })

  it("stops taking roles from a loop that's removed", async () => {
    const { t, as } = await setup()
    const owner = (await t.run((ctx) => ctx.db.query("users").first()))!._id
    const loopId = await t.run((ctx) =>
      ctx.db.insert("loops", {
        show: 5,
        userId: owner,
        name: "Mornings",
        template: "custom",
        answers: {
          usePreferences: false,
          stretch: false,
          remoteOnly: false,
          nearMe: false,
          listedCompanies: false,
          skipRedFlags: false,
          postedToday: false,
        },
        daily: 25,
        at: "08:00",
        timeZone: "UTC",
        active: false,
        nextRunAt: 0,
      })
    )
    const id = await as.mutation(api.api.goals.create, { ...goal, loopId })
    await as.mutation(api.api.loops.remove, { loopId })
    const row = (await as.query(api.api.goals.list)).find((g) => g._id === id)
    expect(row?.loopId).toBe(undefined)
  })

  it("takes applications off a goal that's removed, and only those", async () => {
    const { as, addApplication } = await setup()
    const id = await as.mutation(api.api.goals.create, goal)
    const kept = await as.mutation(api.api.goals.create, { ...goal, name: "Other" })
    const on = await addApplication()
    const elsewhere = await addApplication()
    await as.mutation(api.api.applications.setGoal, { id: on, goalId: id })
    await as.mutation(api.api.applications.setGoal, { id: elsewhere, goalId: kept })
    await as.mutation(api.api.goals.remove, { id })
    const goals = new Map((await as.query(api.api.applications.list)).map((a) => [a._id, a.goalId]))
    expect(goals.get(on)).toBe(undefined)
    expect(goals.get(elsewhere)).toBe(kept)
  })

  it("keeps one person's goals from another", async () => {
    const { t, as, addApplication } = await setup()
    const other = t.withIdentity({
      subject: await t.run((ctx) => ctx.db.insert("users", { name: "Ada" })),
    })
    const goalId = await other.mutation(api.api.goals.create, goal)
    const applicationId = await addApplication()

    expect(await as.query(api.api.goals.list)).toEqual([])
    await expect(
      as.mutation(api.api.applications.setGoal, { id: applicationId, goalId })
    ).rejects.toThrow("That goal isn't yours.")
    await expect(as.mutation(api.api.goals.remove, { id: goalId })).rejects.toThrow(
      "That goal isn't yours."
    )
  })
})
