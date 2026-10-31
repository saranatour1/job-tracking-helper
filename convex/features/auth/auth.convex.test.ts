// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { convexTest } from "convex-test"
import type { Infer } from "convex/values"
import { describe, expect, it, vi } from "vite-plus/test"

import { api, internal } from "../../_generated/api"
import type { Doc, Id } from "../../_generated/dataModel"
import schema from "../../schema"
import { Profile } from "../users/validators"
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

describe("Profile userName", () => {
  const check = (userName: string) => Profile({ name: "", email: "", userName })

  it.each(["", "sara-natour", "a".repeat(39)])("takes %j", (userName) => {
    expect(check(userName)).toMatchObject({ userName })
  })

  it.each(["ab", "a b", "a".repeat(40)])("refuses %j", (userName) => {
    expect(String(check(userName))).toContain("3 to 39 letters, numbers, hyphens or underscores")
  })
})

describe("onGithubSignIn", () => {
  const profile = {
    id: "1",
    login: "sara-natour",
    name: "Sara",
    email: "sara@example.com",
    emailVerified: true,
    avatarUrl: "https://avatars.githubusercontent.com/u/1?v=4",
  }
  const signIn = (
    t: ReturnType<typeof convexTest>,
    userId: Id<"users">,
    overrides: Partial<typeof profile> = {}
  ) =>
    t.mutation(internal.api.auth.onGithubSignIn, {
      userId,
      provider: { name: "github", accountId: "1", profile: { ...profile, ...overrides } },
    })
  const setup = async (fields: Partial<Doc<"users">> = {}) => {
    const t = convexTest(schema, modules)
    const userId = await t.run((ctx) => ctx.db.insert("users", fields))
    const read = () => t.run((ctx) => ctx.db.get("users", userId))
    return { t, userId, read }
  }

  it("fills a blank account from GitHub", async () => {
    const { t, userId, read } = await setup()
    await signIn(t, userId)
    expect(await read()).toMatchObject({
      name: "Sara",
      email: "sara@example.com",
      userName: "sara-natour",
      github: "sara-natour",
      avatarUrl: profile.avatarUrl,
    })
  })

  it("keeps what's already there", async () => {
    const { t, userId, read } = await setup({ name: "Sam", userName: "sam", github: "sam-gh" })
    await signIn(t, userId)
    expect(await read()).toMatchObject({ name: "Sam", userName: "sam", github: "sam-gh" })
  })

  it("imports only once, so cleared fields stay cleared", async () => {
    const { t, userId, read } = await setup()
    await signIn(t, userId)
    await t.run((ctx) => ctx.db.patch("users", userId, { name: undefined, avatarUrl: undefined }))
    await signIn(t, userId)
    const user = await read()
    expect(user?.name).toBeUndefined()
    expect(user?.avatarUrl).toBeUndefined()
  })

  it("skips a username someone else has", async () => {
    const { t, userId, read } = await setup()
    await t.run((ctx) => ctx.db.insert("users", { userName: profile.login }))
    await signIn(t, userId)
    const user = await read()
    expect(user?.userName).toBeUndefined()
    expect(user?.github).toBe(profile.login)
  })

  it("keeps the saved profile valid", async () => {
    const { t, userId, read } = await setup()
    await signIn(t, userId, { login: "ab", name: "x".repeat(200) })
    const user = await read()
    expect(user?.userName).toBeUndefined()
    expect(user?.name).toHaveLength(80)
  })

  it("shows the GitHub photo until it's removed", async () => {
    const { t, userId } = await setup()
    await signIn(t, userId)
    const as = t.withIdentity({ subject: userId })
    expect((await as.query(api.api.users.me, {})).imageUrl).toBe(profile.avatarUrl)
    await as.mutation(api.api.users.setImage, {})
    expect((await as.query(api.api.users.me, {})).imageUrl).toBeNull()
  })
})
