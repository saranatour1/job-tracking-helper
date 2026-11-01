// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import rateLimiter from "@convex-dev/rate-limiter/test"
import workpool from "@convex-dev/workpool/test"
import { convexTest } from "convex-test"
import { afterEach, describe, expect, it, vi } from "vite-plus/test"

import { api, internal } from "../../_generated/api"
import type { Doc, Id } from "../../_generated/dataModel"
import schema from "../../schema"

const modules = import.meta.glob([
  "../../**/*.ts",
  "!../../components/notifications/**",
  "!../../components/cloudflareEmail/**",
  "!../../**/*.test.ts",
])

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

const setup = () => {
  const t = convexTest(schema, modules)
  rateLimiter.register(t)
  return t
}

type T = ReturnType<typeof setup>

const addBoard = (t: T, slug: string, urls: string[], extra: Partial<Doc<"jobBoards">> = {}) =>
  t.run(async (ctx) => {
    const boardId = await ctx.db.insert("jobBoards", {
      kind: "greenhouse",
      slug,
      company: slug[0]!.toUpperCase() + slug.slice(1),
      addedAt: 0,
      jobs: urls.length,
      ...extra,
    })
    for (const url of urls)
      await ctx.db.insert("jobs", {
        boardId,
        url,
        urlKey: url,
        title: "Engineer",
        company: slug,
        location: "",
        remote: false,
        postedAt: 0,
        seenAt: 0,
        text: "Engineer",
      })
    return boardId
  })

// Answers the YC list and RDAP as given, and counts what reaches Firecrawl.
const stubWeb = (searchResults: string[] = []) => {
  const searches: string[] = []
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input)
      const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
      if (url.includes("yc-oss"))
        return json([
          {
            website: "https://stripe.com",
            batch: "Summer 2009",
            status: "Active",
            team_size: 7000,
            url: "https://www.ycombinator.com/companies/stripe",
          },
        ])
      if (url.includes("data.iana.org"))
        return json({ services: [[["com"], ["https://registry.test/"]]] })
      if (url === "https://registry.test/domain/stripe.com")
        return json({
          events: [{ eventAction: "registration", eventDate: "1995-09-12T04:00:00Z" }],
        })
      if (url.includes("registry.test")) return json({}, 404)
      if (url.includes("firecrawl")) {
        searches.push(JSON.parse(init?.body as string).query)
        return json({ data: { web: searchResults.map((u) => ({ url: u })) }, creditsUsed: 2 })
      }
      throw new Error(`Unexpected fetch of ${url}`)
    })
  )
  return searches
}

const research = (t: T, boardIds: Id<"jobBoards">[]) =>
  t.action(internal.api.jobs.researchBoards, { boardIds })

const boardOf = (t: T, id: Id<"jobBoards">) => t.run((ctx) => ctx.db.get("jobBoards", id))
const companies = (t: T) => t.run((ctx) => ctx.db.query("companies").collect())

describe("researching a board", () => {
  it("reads its own site from its postings, with no search", async () => {
    const t = setup()
    const searches = stubWeb()
    const id = await addBoard(t, "stripe", ["https://stripe.com/jobs/1"])
    await research(t, [id])

    expect(searches).toEqual([])
    const [company] = await companies(t)
    expect(company).toMatchObject({
      name: "Stripe",
      domain: "stripe.com",
      registeredAt: Date.UTC(1995, 8, 12, 4),
      yc: { batch: "Summer 2009", status: "Active", teamSize: 7000 },
    })
    expect(await boardOf(t, id)).toMatchObject({
      companyId: company!._id,
      companyLink: "postings",
      researchedAt: expect.any(Number),
    })
  })

  it("keeps one row per domain, but what ties each board to it is the board's own", async () => {
    vi.stubEnv("FIRECRAWL_API_KEY", "key")
    const t = setup()
    stubWeb(["https://stripe.com"])
    const real = await addBoard(t, "stripe", ["https://stripe.com/jobs/1"])
    // Anyone can open a board with a copied name.
    const copy = await addBoard(t, "stripe", ["https://jobs.ashbyhq.com/stripe/1"], {
      kind: "ashby",
    })
    await research(t, [real, copy])

    expect(await companies(t)).toHaveLength(1)
    expect((await boardOf(t, real))?.companyLink).toBe("postings")
    expect((await boardOf(t, copy))?.companyLink).toBe("name")
  })

  it("leaves a board with no site found on a row of its own, and retries on refresh", async () => {
    // Searches wait their turn, which a test needn't sit through.
    vi.stubGlobal("setTimeout", (run: () => void) => queueMicrotask(run))
    vi.stubEnv("FIRECRAWL_API_KEY", "key")
    const t = setup()
    const searches = stubWeb(["https://www.linkedin.com/company/hooli"])
    const id = await addBoard(t, "hooli", ["https://jobs.lever.co/hooli/1"])
    await research(t, [id])
    expect(searches).toEqual(["Hooli official website"])
    expect((await companies(t))[0]).toMatchObject({ name: "Hooli" })
    expect((await companies(t))[0]?.domain).toBeUndefined()
    expect((await boardOf(t, id))?.companyLink).toBeUndefined()

    // The same row, not a second one, and it goes when a site turns up.
    await research(t, [id])
    expect(await companies(t)).toHaveLength(1)
    stubWeb(["https://hooli.xyz"])
    await research(t, [id])
    const after = await companies(t)
    expect(after).toHaveLength(1)
    expect(after[0]?.domain).toBe("hooli.xyz")
    expect((await boardOf(t, id))?.companyLink).toBe("name")
  })

  it("doesn't search again for a site it already found by name", async () => {
    vi.stubEnv("FIRECRAWL_API_KEY", "key")
    const t = setup()
    const searches = stubWeb(["https://hooli.xyz"])
    const id = await addBoard(t, "hooli", ["https://jobs.lever.co/hooli/1"])
    await research(t, [id])
    await research(t, [id])
    expect(searches).toHaveLength(1)
  })

  it("charges the month's Firecrawl credits, and stops searching near the limit", async () => {
    vi.stubEnv("FIRECRAWL_API_KEY", "key")
    const t = setup()
    let searches = stubWeb([])
    const id = await addBoard(t, "hooli", ["https://jobs.lever.co/hooli/1"])
    await research(t, [id])
    expect(searches).toHaveLength(1)
    const usage = await t.run((ctx) => ctx.db.query("sourceUsage").first())
    expect(usage?.used).toBe(2)

    await t.run((ctx) => ctx.db.patch("sourceUsage", usage!._id, { used: 499 }))
    searches = stubWeb([])
    await research(t, [id])
    expect(searches).toEqual([])
  })

  it("leaves a board due when a search may work later, keeping what's done", async () => {
    vi.stubEnv("FIRECRAWL_API_KEY", "key")
    const t = setup()
    stubWeb()
    const done = await addBoard(t, "stripe", ["https://stripe.com/jobs/1"])
    const due = await addBoard(t, "hooli", ["https://jobs.lever.co/hooli/1"])
    const fetchReal = vi.mocked(fetch).getMockImplementation()!
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL, init?: RequestInit) =>
        String(input).includes("firecrawl")
          ? new Response("{}", { status: 429 })
          : fetchReal(input, init)
      )
    )
    await expect(research(t, [done, due])).rejects.toThrow("answered 429")
    expect((await boardOf(t, done))?.researchedAt).toEqual(expect.any(Number))
    expect((await boardOf(t, due))?.researchedAt).toBeUndefined()
  })

  it("settles for no site when a search will never work", async () => {
    vi.stubEnv("FIRECRAWL_API_KEY", "key")
    const t = setup()
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) =>
        String(input).includes("firecrawl")
          ? new Response("{}", { status: 400 })
          : new Response("[]")
      )
    )
    const id = await addBoard(t, "hooli", ["https://jobs.lever.co/hooli/1"])
    await research(t, [id])
    expect((await boardOf(t, id))?.researchedAt).toEqual(expect.any(Number))
  })

  it("marks the month's credits used up on a 402, and stops searching", async () => {
    vi.stubEnv("FIRECRAWL_API_KEY", "key")
    const t = setup()
    let searches = 0
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) => {
        if (!String(input).includes("firecrawl")) return new Response("[]")
        searches++
        return new Response("{}", { status: 402 })
      })
    )
    const ids = [
      await addBoard(t, "hooli", ["https://jobs.lever.co/hooli/1"]),
      await addBoard(t, "initech", ["https://jobs.lever.co/initech/1"]),
    ]
    await research(t, ids)
    expect(searches).toBe(1)
    const usage = await t.run((ctx) => ctx.db.query("sourceUsage").first())
    expect(usage?.exhaustedAt).toEqual(expect.any(Number))
  })

  it("does without a search when there's no key", async () => {
    const t = setup()
    const searches = stubWeb(["https://hooli.xyz"])
    const id = await addBoard(t, "hooli", ["https://jobs.lever.co/hooli/1"])
    await research(t, [id])
    expect(searches).toEqual([])
    expect((await companies(t))[0]?.domain).toBeUndefined()
  })

  it("keeps a known age when the registry doesn't answer", async () => {
    const t = setup()
    stubWeb()
    const id = await addBoard(t, "stripe", ["https://stripe.com/jobs/1"])
    await research(t, [id])
    await t.mutation(internal.api.jobs.saveResearch, {
      boardId: id,
      domain: "stripe.com",
      link: "postings",
      credits: 0,
      exhausted: false,
    })
    expect((await companies(t))[0]?.registeredAt).toBe(Date.UTC(1995, 8, 12, 4))
  })

  it("fails without saving when the YC list is down, so the board stays due", async () => {
    const t = setup()
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: 500 }))
    )
    const id = await addBoard(t, "stripe", ["https://stripe.com/jobs/1"])
    await expect(research(t, [id])).rejects.toThrow("The YC list answered 500")
    expect((await boardOf(t, id))?.researchedAt).toBeUndefined()
  })
})

describe("what shows on Jobs", () => {
  const search = async (t: T) => {
    const userId = await t.run((ctx) => ctx.db.insert("users", { name: "Sam" }))
    const { page } = await t
      .withIdentity({ subject: userId })
      .query(api.api.jobs.search, { paginationOpts: { numItems: 25, cursor: null } })
    return page
  }

  it("is the board's evidence on each of its roles", async () => {
    const t = setup()
    stubWeb()
    await research(t, [await addBoard(t, "stripe", ["https://stripe.com/jobs/1"])])
    const [row] = await search(t)
    expect(row?.evidence).toMatchObject({
      domain: "stripe.com",
      link: "postings",
      registeredAt: Date.UTC(1995, 8, 12, 4),
      yc: { batch: "Summer 2009" },
    })
  })

  it("is empty for a board not researched yet", async () => {
    const t = setup()
    await addBoard(t, "hooli", ["https://jobs.lever.co/hooli/1"])
    const [row] = await search(t)
    expect(row?.evidence).toMatchObject({ domain: null, link: null, yc: null, registeredAt: null })
  })
})

describe("which boards are due", () => {
  const month = 30 * 24 * 60 * 60 * 1000
  const due = (t: T) => {
    workpool.register(t, "readPool")
    return t.mutation(internal.api.jobs.researchDue, {})
  }

  it("is those never researched or not for a month, and only with roles", async () => {
    const t = setup()
    await addBoard(t, "fresh", ["https://a.test/1"])
    await addBoard(t, "stale", ["https://b.test/1"], { researchedAt: Date.now() - 2 * month })
    await addBoard(t, "recent", ["https://c.test/1"], { researchedAt: Date.now() - 1000 })
    await addBoard(t, "empty", [])
    expect(await due(t)).toBe(2)
  })

  it("leaves out boards of many companies", async () => {
    const t = setup()
    await addBoard(t, "remote-ok", ["https://remoteok.com/remote-jobs/1"], { kind: "remoteok" })
    await addBoard(t, "hacker-news", ["https://news.ycombinator.com/item?id=1"], {
      kind: "hackernews",
    })
    await addBoard(t, "pflege|berlin", ["https://www.arbeitsagentur.de/jobsuche/jobdetail/1"], {
      kind: "arbeitsagentur",
    })
    expect(await due(t)).toBe(0)
    expect(await t.query(internal.api.migrations.companiesLeft, {})).toBe(0)
  })

  it("takes a batch at a time", async () => {
    const t = setup()
    for (let n = 0; n < 30; n++) await addBoard(t, `board${n}`, [`https://a.test/${n}`])
    expect(await due(t)).toBe(25)
  })
})

describe("the backfill", () => {
  it("counts boards with roles and no company", async () => {
    const t = setup()
    stubWeb()
    const id = await addBoard(t, "stripe", ["https://stripe.com/jobs/1"])
    await addBoard(t, "empty", [])
    expect(await t.query(internal.api.migrations.companiesLeft, {})).toBe(1)
    await research(t, [id])
    expect(await t.query(internal.api.migrations.companiesLeft, {})).toBe(0)
  })
})
