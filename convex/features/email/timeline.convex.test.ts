// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { convexTest } from "convex-test"
import { describe, expect, it, vi } from "vite-plus/test"

import { api } from "../../_generated/api"
import { seal } from "../../lib/secrets"
import schema from "../../schema"
import { aad, keys } from "./utils"

const modules = import.meta.glob([
  "../../**/*.ts",
  "!../../components/notifications/**",
  "!../../components/cloudflareEmail/**",
  "!../../**/*.test.ts",
])

describe("the mail timeline", () => {
  it("keeps the newest mail past its limit, wherever it was filed", async () => {
    vi.stubEnv("SECRETS_KEYS", `v1:${btoa(String.fromCharCode(...new Uint8Array(32).fill(7)))}`)
    const t = convexTest(schema, modules)
    const userId = await t.run((ctx) => ctx.db.insert("users", { name: "Sam" }))
    const k = await keys()
    const note = await seal(k, JSON.stringify({ from: "a", subject: "s" }), aad.email(userId))
    await t.run(async (ctx) => {
      const applicationId = await ctx.db.insert("applications", {
        userId,
        company: "Hooli",
        role: "Engineer",
        status: "applied",
        number: 1,
        history: [],
      })
      for (let at = 0; at < 301; at++)
        await ctx.db.insert("mailEvents", {
          userId,
          emailId: `e${at}`,
          kind: "other",
          note,
          at,
          by: "rules",
        })
      await ctx.db.insert("mailEvents", {
        userId,
        emailId: "newest",
        applicationId,
        kind: "other",
        note,
        at: 1000,
        by: "rules",
      })
    })
    const events = await t.withIdentity({ subject: userId }).query(api.api.email.timeline, {})
    expect(events).toHaveLength(300)
    expect(events[0]?.at).toBe(1000)
  })
})
