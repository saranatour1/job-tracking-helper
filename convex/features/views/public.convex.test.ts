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

const setup = async () => {
  const t = convexTest(schema, modules)
  const userId = await t.run((ctx) => ctx.db.insert("users", { name: "Sam" }))
  return t.withIdentity({ subject: userId })
}

const view = { name: "Remote", description: "", filters: { status: ["saved"] } }

describe("saved views", () => {
  it("trims what it stores", async () => {
    const as = await setup()
    await as.mutation(api.views.create, { ...view, name: "  Remote  ", description: " Later " })
    const [saved] = await as.query(api.views.list, {})
    expect(saved).toMatchObject({ name: "Remote", description: "Later" })
  })

  it("says what's wrong with a name or its filters", async () => {
    const as = await setup()
    await expect(as.mutation(api.views.create, { ...view, name: "  " })).rejects.toThrow(
      "Give the view a name"
    )
    await expect(
      as.mutation(api.views.create, {
        ...view,
        filters: Object.fromEntries(Array.from({ length: 11 }, (_, i) => [`f${i}`, ["x"]])),
      })
    ).rejects.toThrow("up to 10 fields")
    await expect(as.query(api.views.list, {})).resolves.toEqual([])
  })
})
