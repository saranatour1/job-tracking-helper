// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import mcpTest from "@convex-dev/mcp/test"
import rateLimiter from "@convex-dev/rate-limiter/test"
import workpool from "@convex-dev/workpool/test"
import { convexTest } from "convex-test"
import { describe, expect, it, vi } from "vite-plus/test"

import { api, internal } from "../../_generated/api"
import type { Id } from "../../_generated/dataModel"
import notificationsSchema from "../../components/notifications/schema"
import schema from "../../schema"
import { limits } from "../workflows/manager"
import { revokeAgents } from "./utils"

vi.stubEnv("CONVEX_SITE_URL", "https://test.convex.site")
vi.stubEnv("SITE_URL", "https://app.example.com")

const { mcp } = await import("../../mcp")

const modules = import.meta.glob([
  "../../**/*.ts",
  "!../../components/notifications/**",
  "!../../components/cloudflareEmail/**",
  "!../../**/*.test.ts",
])

const setup = async () => {
  vi.stubEnv("FIRECRAWL_API_KEY", "fc-test")
  const t = convexTest(schema, modules)
  mcpTest.register(t)
  rateLimiter.register(t)
  workpool.register(t, "applyPool")
  t.registerComponent(
    "notifications",
    notificationsSchema,
    import.meta.glob("../../components/notifications/**/*.ts")
  )
  const user = (name: string) => t.run((ctx) => ctx.db.insert("users", { name }))
  const [sam, alex] = [await user("Sam"), await user("Alex")]
  const keyOf = async (userId: Id<"users">, scopes?: string[]) =>
    (await t.action(internal.mcp.createApiKeyForUser, { userId, ...(scopes && { scopes }) })).apiKey
  const call = async (key: string, name: string, args: object = {}) => {
    const response = await t.fetch("/mcp", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "MCP-Protocol-Version": "2025-06-18",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name, arguments: args },
      }),
    })
    if (!response.ok) return { status: response.status, isError: true, text: "", data: null }
    const { result } = (await response.json()) as {
      result: {
        isError?: boolean
        content: { text: string }[]
        structuredContent?: Record<string, never>
      }
    }
    return {
      status: response.status,
      isError: result.isError === true,
      text: result.content[0]?.text ?? "",
      data: result.structuredContent ?? null,
    }
  }
  return { t, sam, alex, keyOf, call }
}

const seedPrefill = (t: Awaited<ReturnType<typeof setup>>["t"], userId: Id<"users">) =>
  t.run((ctx) =>
    ctx.db.insert("prefills", {
      userId,
      urlKey: "boards.greenhouse.io/hooli/1",
      url: "https://boards.greenhouse.io/hooli/jobs/1",
      company: "Hooli",
      title: "Engineer",
      status: "ready",
      liveUrl: "https://browser.example.com/secret-session",
      scrapeId: "scrape-secret",
      fields: [
        { question: "Why Hooli?", type: "textarea", required: true, source: "you", answer: "Mine" },
      ],
    })
  )

describe("the MCP server", () => {
  it("has no risky tool setups", () => {
    expect(mcp.lint()).toEqual([])
  })

  it("refuses another person's ids on every tool that takes one", async () => {
    const { t, sam, alex, keyOf, call } = await setup()
    const ids = await t.run(async (ctx) => {
      const loop = await ctx.db.insert("loops", {
        userId: sam,
        name: "Sam's loop",
        template: "custom",
        answers: {
          usePreferences: true,
          stretch: false,
          remoteOnly: false,
          nearMe: false,
          listedCompanies: false,
          skipRedFlags: false,
          postedToday: false,
        },
        daily: 25,
        show: 3,
        at: "08:00",
        timeZone: "UTC",
        active: false,
        nextRunAt: 0,
      })
      const lead = await ctx.db.insert("jobLeads", {
        userId: sam,
        url: "https://boards.greenhouse.io/hooli/jobs/1",
        urlKey: "boards.greenhouse.io/hooli/1",
        title: "Sam's role",
        company: "Hooli",
        snippet: "",
        fit: 90,
        reasons: ["Sam's reason"],
        status: "new",
        verdict: "fit",
      })
      const goal = await ctx.db.insert("goals", {
        userId: sam,
        name: "Sam's goal",
        summary: "",
        priority: "none",
        start: "2026-01-01",
        target: "2026-02-01",
        milestones: [],
      })
      const view = await ctx.db.insert("views", {
        userId: sam,
        name: "Sam's view",
        description: "",
        filters: {},
      })
      const workflow = await ctx.db.insert("automations", {
        userId: sam,
        name: "Sam's workflow",
        trigger: { kind: "manual" },
        steps: [{ kind: "notify", message: "hi" }],
        active: true,
      })
      return { loop, lead, goal, view, workflow }
    })
    const prefill = await seedPrefill(t, sam)
    const key = await keyOf(alex)
    const step = { kind: "notify", message: "hi" }
    const attempts: [string, object][] = [
      ["get_job", { id: ids.lead }],
      ["respond_to_job", { id: ids.lead, action: "dismiss" }],
      ["save_job_search", { id: ids.loop, name: "Mine now" }],
      ["run_job_search", { id: ids.loop }],
      ["prepare_application", { id: ids.lead }],
      ["get_prepared_application", { id: prefill }],
      ["set_application_answer", { id: prefill, question: "Why Hooli?", answer: "Taken" }],
      ["save_goal", { id: ids.goal, name: "Mine now" }],
      ["save_goal", { name: "Linked", target: "2026-03-01", loopId: ids.loop }],
      ["save_view", { id: ids.view, name: "Mine now" }],
      ["get_workflow", { id: ids.workflow }],
      [
        "save_workflow",
        { id: ids.workflow, name: "Mine now", trigger: { kind: "manual" }, steps: [step] },
      ],
      [
        "save_workflow",
        {
          name: "Sneaky",
          trigger: { kind: "manual" },
          steps: [{ kind: "findRoles", loopId: ids.loop }],
        },
      ],
      [
        "save_workflow",
        {
          name: "Sneaky goal",
          trigger: { kind: "status", to: ["applied"] },
          steps: [{ kind: "putOnGoal", goalId: ids.goal }],
        },
      ],
      [
        "save_workflow",
        {
          name: "Sneaky trigger",
          trigger: { kind: "goal", goals: [ids.goal] },
          steps: [{ kind: "notify", message: "hi" }],
        },
      ],
    ]
    for (const [name, args] of attempts) {
      const result = await call(key, name, args)
      expect(result.isError, name).toBe(true)
      expect(result.text, name).not.toContain("Sam")
    }
    await t.run(async (ctx) => {
      expect((await ctx.db.get("jobLeads", ids.lead))?.status).toBe("new")
      expect((await ctx.db.get("loops", ids.loop))?.name).toBe("Sam's loop")
      expect((await ctx.db.get("goals", ids.goal))?.name).toBe("Sam's goal")
      expect((await ctx.db.get("views", ids.view))?.name).toBe("Sam's view")
      expect((await ctx.db.get("automations", ids.workflow))?.active).toBe(true)
      expect((await ctx.db.get("prefills", prefill))?.fields[0]?.answer).toBe("Mine")
    })
  })

  it("hides write tools from a read-only key", async () => {
    const { sam, keyOf, call } = await setup()
    const key = await keyOf(sam, ["preferences:read"])
    expect((await call(key, "get_preferences")).isError).toBe(false)
    expect((await call(key, "update_preferences", { identity: "x" })).status).toBe(403)
  })

  it("merges preferences, and adding keeps what's there", async () => {
    const { sam, keyOf, call } = await setup()
    const key = await keyOf(sam)
    await call(key, "update_preferences", { interests: ["Robots"], answers: { pay: "100k" } })
    await call(key, "update_preferences", { identity: "Builder" })
    const { data, isError } = await call(key, "add_preferences", {
      interests: ["Robots", "Space"],
      custom: [{ question: "Pets?", answer: "Yes" }],
    })
    expect(isError).toBe(false)
    expect(data).toMatchObject({
      interests: ["Robots", "Space"],
      identity: "Builder",
      answers: { pay: "100k" },
      custom: [{ question: "Pets?", answer: "Yes" }],
    })
    // The empty form is shared, so one person's answers mustn't reach the next.
    const other = await setup()
    const fresh = await other.call(await other.keyOf(other.sam), "get_preferences")
    expect(fresh.data).toMatchObject({ interests: [], custom: [] })
  })

  it("keeps an agent's answer a draft, and never hands over the live browser", async () => {
    const { t, sam, keyOf, call } = await setup()
    const id = await seedPrefill(t, sam)
    const key = await keyOf(sam)
    const { data, text } = await call(key, "set_application_answer", {
      id,
      question: "Why Hooli?",
      answer: "The work fits.",
    })
    expect(data).toMatchObject({
      status: "needsAnswers",
      fields: [{ source: "ai", answer: "The work fits." }],
    })
    expect(text).not.toContain("secret")
    expect((await call(key, "get_prepared_application", { id })).text).not.toContain("secret")
    await t.run((ctx) => ctx.db.patch("prefills", id, { status: "live" }))
    expect(
      (await call(key, "set_application_answer", { id, question: "Why Hooli?", answer: "No" }))
        .isError
    ).toBe(true)
  })

  it("always saves a workflow off, even one that was on", async () => {
    const { t, sam, keyOf, call } = await setup()
    const key = await keyOf(sam)
    const workflow = {
      name: "Leak",
      trigger: { kind: "manual" },
      steps: [{ kind: "sendEmail", to: "someone@example.com", subject: "Hi", text: "Hello" }],
    }
    const { data } = await call(key, "save_workflow", workflow)
    expect(data).toMatchObject({ active: false })
    const id = (data as unknown as { id: Id<"automations"> }).id
    await t.run((ctx) => ctx.db.patch("automations", id, { active: true }))
    const again = await call(key, "save_workflow", { ...workflow, id })
    expect(again.data).toMatchObject({ active: false })
  })

  it("keeps an agent's standing answers off forms until the person saves them", async () => {
    const { t, sam, keyOf, call } = await setup()
    const id = await seedPrefill(t, sam)
    const key = await keyOf(sam)
    await t.run((ctx) => ctx.db.patch("users", sam, { email: "sam@example.com" }))
    await call(key, "update_preferences", { answers: { pay: "100k" } })
    await call(key, "add_preferences", {
      custom: [{ question: "Email", answer: "attacker@evil.example" }],
    })
    const asPlan = () => t.query(internal.api.prefilled.plan, { id })
    const said = async () => (await asPlan())!.answers.map((a) => a.value)
    expect(await said()).toEqual(["Sam", "sam@example.com"])

    // Saving the page is the person's word, and a later agent edit only taints what it changed.
    const asSam = t.withIdentity({ subject: sam })
    const form = await call(key, "get_preferences")
    const { hasResume: _hasResume, ...saved } = form.data as unknown as Record<string, unknown>
    await asSam.mutation(api.api.preferences.save, saved as never)
    expect(await said()).toContain("attacker@evil.example")
    await call(key, "update_preferences", { answers: { visa: "None" } })
    expect(await said()).toContain("100k")
    expect(await said()).not.toContain("None")
  })

  it("won't let a workflow an agent wrote start until it's saved in the app", async () => {
    const { t, sam, keyOf, call } = await setup()
    const key = await keyOf(sam)
    const workflow = {
      name: "Leak",
      trigger: { kind: "manual" as const },
      steps: [
        { kind: "sendEmail" as const, to: "someone@example.com", subject: "Hi", text: "Hello" },
      ],
    }
    const { data } = await call(key, "save_workflow", workflow)
    const id = (data as unknown as { id: Id<"automations"> }).id
    const asSam = t.withIdentity({ subject: sam })
    await expect(
      asSam.mutation(api.api.automations.setActive, { id, active: true })
    ).rejects.toThrow(/read every step/)
    await expect(asSam.mutation(api.api.automations.runNow, { id })).rejects.toThrow(
      /read every step/
    )
    await asSam.mutation(api.api.automations.save, { id, ...workflow, active: true })
    const row = await t.run((ctx) => ctx.db.get("automations", id))
    expect(row).toMatchObject({ active: true })
    expect(row?.byAgent).toBeUndefined()
  })

  it("won't fetch a link off the catalog's boards for an agent", async () => {
    const { sam, keyOf, call } = await setup()
    const key = await keyOf(sam)
    for (const url of [
      "https://evil.example/?pay=100k",
      "https://boards.greenhouse.io.evil.example/hooli/jobs/1",
      "https://boards.greenhouse.io@evil.example/hooli/jobs/1",
      "https://boards.greenhouse.io/attackerco/jobs/1",
    ]) {
      const { isError, text } = await call(key, "check_job_link", { url })
      expect(isError).toBe(true)
      expect(text).toContain("Agents can only check")
    }
  })

  it("limits how much an agent can call and change", async () => {
    const { t, sam, keyOf, call } = await setup()
    const key = await keyOf(sam)
    // Sharded, so where it runs out moves around a little.
    let reads = 0
    let last = await call(key, "list_goals")
    while (!last.isError && reads < 200) {
      reads++
      last = await call(key, "list_goals")
    }
    expect(reads).toBeGreaterThan(50)
    expect(reads).toBeLessThanOrEqual(120)
    expect(last.text).toContain("Too many")
    await t.run(async (ctx) => {
      for (let i = 0; i < 700; i++) await limits.limit(ctx, "agentWrite", { key: sam })
    })
    const writes = await call(key, "update_preferences", { identity: "Too many" })
    expect(writes).toMatchObject({ isError: true, text: expect.stringContaining("500 changes") })
  })

  it("lists workflows without their steps", async () => {
    const { sam, keyOf, call } = await setup()
    const key = await keyOf(sam)
    const { data } = await call(key, "save_workflow", {
      name: "Long",
      trigger: { kind: "manual" },
      steps: [{ kind: "notify", message: "Hi" }],
    })
    expect(data).toMatchObject({ stepCount: 1 })
    expect(data).not.toHaveProperty("steps")
    const id = (data as unknown as { id: string }).id
    expect((await call(key, "get_workflow", { id })).data).toMatchObject({
      steps: [{ kind: "notify", message: "Hi" }],
    })
  })

  it("starts a designed loop paused", async () => {
    const { sam, keyOf, call } = await setup()
    const { data, isError } = await call(await keyOf(sam), "save_job_search", {
      name: "Remote",
      timeZone: "UTC",
      answers: { remoteOnly: true },
    })
    expect(isError).toBe(false)
    expect(data).toMatchObject({ active: false, answers: { remoteOnly: true } })
  })

  it("sends a muted-aware message to the inbox", async () => {
    const { t, sam, keyOf, call } = await setup()
    const key = await keyOf(sam)
    expect((await call(key, "notify_user", { message: "  " })).isError).toBe(true)
    expect((await call(key, "notify_user", { message: "Two roles fit." })).data).toEqual({
      sent: true,
    })
    const signedIn = t.withIdentity({ subject: sam })
    const [line] = await signedIn.query(api.api.inbox.inbox)
    expect(line).toMatchObject({ title: "From a connected agent", message: "Two roles fit." })
    await signedIn.mutation(api.api.inbox.setOn, { kind: "agent.message", on: false })
    expect((await call(key, "notify_user", { message: "Again" })).data).toEqual({ sent: false })
  })

  it("stops working when the account's agents are revoked", async () => {
    const { t, sam, keyOf, call } = await setup()
    const key = await keyOf(sam)
    expect((await call(key, "get_preferences")).status).toBe(200)
    await t.run((ctx) => revokeAgents(ctx, sam))
    expect((await call(key, "get_preferences")).status).toBe(401)
  })
})
