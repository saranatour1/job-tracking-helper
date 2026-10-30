// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { convexTest } from "convex-test"
import { describe, expect, it } from "vite-plus/test"

import { api } from "../../../_generated/api"
import schema from "../../../schema"

const modules = import.meta.glob([
  "../../../**/*.ts",
  "!../../../notifications/**",
  "!../../../cloudflareEmail/**",
  "!../../../**/*.test.ts",
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
    const id = await as.mutation(api.goals.create, goal)
    expect((await as.query(api.goals.list)).map((g) => g._id)).toEqual([id])

    await as.mutation(api.goals.update, {
      id,
      name: "  Land a role  ",
      milestones: [{ name: "Polish resume", done: true }],
    })
    const [saved] = await as.query(api.goals.list)
    expect(saved?.name).toBe("Land a role")
    expect(saved?.milestones[0]?.done).toBe(true)
  })

  it("refuses a blank name and a date that isn't a day", async () => {
    const { as } = await setup()
    await expect(as.mutation(api.goals.create, { ...goal, name: "  " })).rejects.toThrow()
    await expect(as.mutation(api.goals.create, { ...goal, start: "soon" })).rejects.toThrow()
  })

  it("lets an application join a goal, and leave it when the goal goes", async () => {
    const { t, as, addApplication } = await setup()
    const goalId = await as.mutation(api.goals.create, goal)
    const applicationId = await addApplication()

    await as.mutation(api.applications.setGoal, { id: applicationId, goalId })
    expect((await t.run((ctx) => ctx.db.get("applications", applicationId)))?.goalId).toBe(goalId)

    await as.mutation(api.goals.remove, { id: goalId })
    expect(await as.query(api.goals.list)).toEqual([])
    expect((await t.run((ctx) => ctx.db.get("applications", applicationId)))?.goalId).toBe(
      undefined
    )
  })

  it("keeps one person's goals from another", async () => {
    const { t, as, addApplication } = await setup()
    const other = t.withIdentity({
      subject: await t.run((ctx) => ctx.db.insert("users", { name: "Ada" })),
    })
    const goalId = await other.mutation(api.goals.create, goal)
    const applicationId = await addApplication()

    expect(await as.query(api.goals.list)).toEqual([])
    await expect(
      as.mutation(api.applications.setGoal, { id: applicationId, goalId })
    ).rejects.toThrow("That goal isn't yours.")
    await expect(as.mutation(api.goals.remove, { id: goalId })).rejects.toThrow(
      "That goal isn't yours."
    )
  })
})
