// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import rateLimiter from "@convex-dev/rate-limiter/test"
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
  { name: "google", accountId: "a", profile: { id: "1", emailVerified: true } },
]
const anonymous: Provider = { name: "anonymous", accountId: "a", profile: {} }
const github: Provider = {
  name: "github",
  accountId: "a",
  profile: { id: "1", login: "a", emailVerified: true },
}

const count = (t: ReturnType<typeof convexTest>) =>
  t.run(async (ctx) => (await ctx.db.query("users").take(5)).length)

describe("anonymous accounts on production", () => {
  const visitor = async () => {
    vi.stubEnv("SITE_URL", "https://ye.saranatour.dev")
    const t = convexTest(schema, modules)
    rateLimiter.register(t)
    const userId = await t.mutation(internal.api.auth.createUser, { provider: anonymous })
    return { t, as: t.withIdentity({ subject: userId }) }
  }

  it("can be made, and know what they are", async () => {
    const { as } = await visitor()
    expect(await as.query(api.api.users.me, {})).toMatchObject({
      anonymous: true,
      allowedSearch: null,
    })
  })

  it("can't reach the app: not its queries, mutations or actions", async () => {
    const { as } = await visitor()
    await expect(as.query(api.api.jobs.companies, {})).rejects.toThrow("Not signed in")
    await expect(as.mutation(api.api.users.deleteAccount, {})).rejects.toThrow("Not signed in")
    await expect(as.action(api.api.resume.review, {})).rejects.toThrow("Not signed in")
  })

  it("get 10 searches a day, and repeating one costs nothing", async () => {
    const { as } = await visitor()
    for (let n = 1; n <= 10; n++) {
      await as.mutation(api.api.jobs.allowSearch, { q: `search ${n}` })
      await as.mutation(api.api.jobs.allowSearch, { q: `search ${n}` })
    }
    await expect(as.mutation(api.api.jobs.allowSearch, { q: "one more" })).rejects.toThrow(
      "That's 10 searches today"
    )
    expect((await as.query(api.api.users.me, {})).allowedSearch).toBe("search 10")
  })

  const addRoles = (t: ReturnType<typeof convexTest>, titles: string[]) =>
    t.run(async (ctx) => {
      const boardId = await ctx.db.insert("jobBoards", {
        kind: "lever",
        slug: "hooli",
        company: "Hooli",
        addedAt: 0,
        jobs: titles.length,
      })
      for (const [n, text] of titles.entries())
        await ctx.db.insert("jobs", {
          boardId,
          urlKey: text,
          url: `https://jobs.lever.co/hooli/${text}`,
          title: text,
          company: "Hooli",
          location: "",
          remote: false,
          postedAt: n,
          seenAt: n,
          text,
        })
    })

  it("stop being made past 100 an hour, for everyone", async () => {
    const { t } = await visitor()
    for (let n = 1; n < 100; n++)
      await t.mutation(internal.api.auth.createUser, { provider: anonymous })
    await expect(t.mutation(internal.api.auth.createUser, { provider: anonymous })).rejects.toThrow(
      "Too many new visitors"
    )
    await t.mutation(internal.api.auth.createUser, { provider: github })
  })

  it("see one page of the catalog, and nobody sees more than 25 at once", async () => {
    const { t, as } = await visitor()
    await addRoles(
      t,
      Array.from({ length: 30 }, (_, n) => `role ${n}`)
    )
    const member = await t.run((ctx) => ctx.db.insert("users", { name: "Sam" }))
    const big = { numItems: 100, cursor: null }

    for (const reader of [t, as]) {
      const first = await reader.query(api.api.jobs.search, { paginationOpts: big })
      expect(first).toMatchObject({ isDone: true, continueCursor: "" })
      expect(first.page).toHaveLength(25)
    }
    const forged = await as.query(api.api.jobs.search, {
      paginationOpts: { numItems: 25, cursor: "from a member" },
    })
    expect(forged.page).toEqual([])

    const asMember = t.withIdentity({ subject: member })
    const first = await asMember.query(api.api.jobs.search, { paginationOpts: big })
    expect(first.page).toHaveLength(25)
    const rest = await asMember.query(api.api.jobs.search, {
      paginationOpts: { numItems: 25, cursor: first.continueCursor },
    })
    expect(rest.page).toHaveLength(5)
  })

  it("only search for what they've spent a search on", async () => {
    const { t, as } = await visitor()
    await addRoles(t, ["gardener", "pilot"])
    const titles = async (q: string) =>
      (
        await as.query(api.api.jobs.search, { q, paginationOpts: { numItems: 25, cursor: null } })
      ).page.map((r) => r.title)
    // Not spent yet: the newest roles, not a search. Same with no account at all.
    expect(await titles("gardener")).toEqual(["pilot", "gardener"])
    await as.mutation(api.api.jobs.allowSearch, { q: "gardener" })
    expect(await titles("gardener")).toEqual(["gardener"])
    expect(await titles("pilot")).toEqual(["pilot", "gardener"])
    expect(
      (
        await t.query(api.api.jobs.search, {
          q: "gardener",
          paginationOpts: { numItems: 25, cursor: null },
        })
      ).page
    ).toHaveLength(2)
  })
})

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
