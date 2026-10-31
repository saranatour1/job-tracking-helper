// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { convexTest } from "convex-test"
import type { Infer } from "convex/values"
import { describe, expect, it, vi } from "vite-plus/test"

import { internal } from "../../_generated/api"
import schema from "../../schema"
import { vCreateUserArgs } from "./validators"

const modules = import.meta.glob(["../../**/*.ts", "!../../**/*.test.ts"])

type Provider = Infer<typeof vCreateUserArgs.provider>

const closed: Provider[] = [
  { name: "password", accountId: "a", profile: {} },
  { name: "anonymous", accountId: "a", profile: {} },
  { name: "google", accountId: "a", profile: { id: "1", emailVerified: true } },
]
const github: Provider = {
  name: "github",
  accountId: "a",
  profile: { id: "1", login: "a", emailVerified: true },
}

const count = (t: ReturnType<typeof convexTest>) =>
  t.run(async (ctx) => (await ctx.db.query("users").take(5)).length)

describe("createUser", () => {
  it.each(closed)("refuses $name on production without making a user", async (provider) => {
    vi.stubEnv("SITE_URL", "https://ye.saranatour.dev")
    const t = convexTest(schema, modules)
    await expect(t.mutation(internal.api.auth.createUser, { provider })).rejects.toThrow(
      "Sign-ups are closed"
    )
    expect(await count(t)).toBe(0)
  })

  it("takes GitHub on production", async () => {
    vi.stubEnv("SITE_URL", "https://ye.saranatour.dev")
    const t = convexTest(schema, modules)
    await t.mutation(internal.api.auth.createUser, { provider: github })
    expect(await count(t)).toBe(1)
  })

  it.each(closed)("takes $name locally", async (provider) => {
    vi.stubEnv("SITE_URL", "http://localhost:3000")
    const t = convexTest(schema, modules)
    await t.mutation(internal.api.auth.createUser, { provider })
    expect(await count(t)).toBe(1)
  })
})
