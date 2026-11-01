// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import aggregate from "@convex-dev/aggregate/test"
import shardedCounter from "@convex-dev/sharded-counter/test"
import { convexTest } from "convex-test"
import { afterEach, describe, expect, it, vi } from "vite-plus/test"

import { api, internal } from "../../_generated/api"
import type { Id } from "../../_generated/dataModel"
import schema from "../../schema"
import { countCatalog } from "./utils"

const modules = import.meta.glob([
  "../../**/*.ts",
  "!../../components/notifications/**",
  "!../../components/cloudflareEmail/**",
  "!../../**/*.test.ts",
])

const board = (n: number, jobs: number) => ({
  kind: "greenhouse" as const,
  slug: `company${n}`,
  company: `Company ${String(n).padStart(4, "0")}`,
  addedAt: 0,
  jobs,
})

const setup = async () => {
  const t = convexTest(schema, modules)
  aggregate.register(t, "jobRoleCounts")
  aggregate.register(t, "jobDomainCounts")
  shardedCounter.register(t)
  const userId = await t.run((ctx) => ctx.db.insert("users", { name: "Sam" }))
  return { t, as: t.withIdentity({ subject: userId }) }
}

describe("the job catalog's totals", () => {
  it("has none until it's first counted, rather than a wrong zero", async () => {
    const { as } = await setup()
    expect(await as.query(api.api.jobs.stats, {})).toBeNull()
  })

  it("stays right past the old limit of 1,000 boards", async () => {
    const { t, as } = await setup()
    await t.run(async (ctx) => {
      for (let n = 0; n < 1001; n++) await ctx.db.insert("jobBoards", board(n, 2))
      await countCatalog(ctx, {})
    })
    expect(await as.query(api.api.jobs.stats, {})).toEqual({ boards: 1001, jobs: 2002 })
  })

  it("follows a fetch, a failed fetch and a new board", async () => {
    const { t, as } = await setup()
    const boardId: Id<"jobBoards"> = await t.run(async (ctx) => {
      const id = await ctx.db.insert("jobBoards", board(1, 5))
      await countCatalog(ctx, {})
      return id
    })
    const fetched = { boardId }
    await t.mutation(internal.api.jobs.boardFetched, { ...fetched, jobs: 8 })
    expect(await as.query(api.api.jobs.stats, {})).toEqual({ boards: 1, jobs: 8 })
    // A failed fetch keeps what the board had.
    await t.mutation(internal.api.jobs.boardFetched, { ...fetched, jobs: 0, error: "Down" })
    expect(await as.query(api.api.jobs.stats, {})).toEqual({ boards: 1, jobs: 8 })
    await t.mutation(internal.api.jobs.ensureBoard, { kind: "lever", slug: "hooli" })
    await t.mutation(internal.api.jobs.ensureBoard, { kind: "lever", slug: "hooli" })
    expect(await as.query(api.api.jobs.stats, {})).toEqual({ boards: 2, jobs: 8 })
  })

  it("counts what's there when the first change comes, once", async () => {
    const { t, as } = await setup()
    const boardId = await t.run((ctx) => ctx.db.insert("jobBoards", board(1, 5)))
    await t.mutation(internal.api.jobs.boardFetched, { boardId, jobs: 9 })
    expect(await as.query(api.api.jobs.stats, {})).toEqual({ boards: 1, jobs: 9 })
  })
})

describe("the public catalog", () => {
  const opts = { numItems: 25, cursor: null }

  const withLead = async () => {
    const { t, as } = await setup()
    const jobId = await t.run(async (ctx) => {
      const boardId = await ctx.db.insert("jobBoards", board(1, 1))
      const userId = await ctx.db.insert("users", { name: "Pat" })
      const url = "https://boards.greenhouse.io/hooli/jobs/1"
      await ctx.db.insert("jobLeads", {
        userId,
        url,
        urlKey: url,
        title: "Engineer",
        company: "Hooli",
        snippet: "Engineer",
        fit: 90,
        reasons: [],
        status: "new",
        verdict: "fit",
      })
      for (let n = 1; n <= 30; n++)
        await ctx.db.insert("jobs", {
          boardId,
          urlKey: n === 1 ? url : `${url}${n}`,
          url,
          title: "Engineer",
          company: "Hooli",
          location: "Berlin",
          remote: false,
          postedAt: n,
          seenAt: n,
          text: "Engineer",
        })
      return ctx.db
        .query("jobs")
        .first()
        .then((job) => job!._id)
    })
    return { t, as, jobId }
  }

  it("lets anyone read the newest roles, with no verdicts and no bigger pages than the app asks for", async () => {
    const { t } = await withLead()
    const found = await t.query(api.api.jobs.search, {
      paginationOpts: { ...opts, numItems: 1000 },
      fits: true,
    })
    expect(found.page).toHaveLength(25)
    expect(found.page.every((r) => r.verdict === null && r.fit === null)).toBe(true)
  })

  it("opens one role to anyone, and nothing for what isn't one", async () => {
    const { t, jobId } = await withLead()
    expect(await t.query(api.api.jobs.posting, { id: jobId })).toMatchObject({
      title: "Engineer",
      verdict: null,
      text: "Engineer",
    })
    expect(await t.query(api.api.jobs.posting, { id: "nonsense" })).toBeNull()
  })

  it("keeps filters and companies for people signed in", async () => {
    const { t, as } = await withLead()
    await expect(t.query(api.api.jobs.companies, {})).rejects.toThrow("Not signed in")
    expect(
      (await as.query(api.api.jobs.search, { paginationOpts: opts, remoteOnly: true })).page
    ).toEqual([])
  })
})

describe("Arbeitsagentur searches", () => {
  afterEach(() => vi.unstubAllGlobals())

  it("fetches a search's roles with their text, under the search's own name", async () => {
    const { t, as } = await setup()
    const calls: Request[] = []
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string, init?: RequestInit) => {
        calls.push(new Request(input, init))
        const body = input.includes("/jobdetails/")
          ? { stellenangebotsBeschreibung: "Pflege im **Krankenhaus**." }
          : {
              woOutput: { bereinigterOrt: "Berlin" },
              ergebnisliste: [
                {
                  referenznummer: "10001-1-S",
                  stellenangebotsTitel: "Pflegefachkraft",
                  firma: "Permacon GmbH",
                  datumErsteVeroeffentlichung: "2026-10-30",
                  stellenlokationen: [{ adresse: { ort: "Berlin" } }],
                },
              ],
            }
        return new Response(JSON.stringify(body))
      })
    )
    const [boardId] = await t.mutation(internal.api.jobs.addSearches, {
      searches: [{ what: "Pflegefachkraft", where: "Berlin" }],
    })
    await t.action(internal.api.jobs.fetchBoard, { boardId: boardId! })
    expect(calls).toHaveLength(2)
    for (const call of calls) expect(call.headers.get("X-API-Key")).toBe("jobboerse-jobsuche")
    expect(calls[1]?.url).toContain(`/jobdetails/${encodeURIComponent(btoa("10001-1-S"))}`)
    const jobs = await t.run((ctx) => ctx.db.query("jobs").collect())
    expect(jobs).toHaveLength(1)
    expect(jobs[0]).toMatchObject({
      boardId,
      company: "Permacon GmbH",
      url: "https://www.arbeitsagentur.de/jobsuche/jobdetail/10001-1-S",
    })
    expect(jobs[0]?.text).toContain("Pflege im **Krankenhaus**.")
    expect(await as.query(api.api.jobs.companies, {})).toEqual([
      { boardId, company: "Arbeitsagentur: Pflegefachkraft, Berlin", domain: null, jobs: 1 },
    ])
  })

  it("keeps listed roles, updates changed ones and drops the ones no longer listed", async () => {
    const { t } = await setup()
    const feed = (titles: string[]) =>
      vi.fn(async (input: string) =>
        input.includes("/jobdetails/")
          ? new Response(JSON.stringify({ stellenangebotsBeschreibung: "Pflege." }))
          : new Response(
              JSON.stringify({
                woOutput: { bereinigterOrt: "Berlin" },
                ergebnisliste: titles.map((title, i) => ({
                  referenznummer: `10001-${i}-S`,
                  stellenangebotsTitel: title,
                  firma: "Permacon GmbH",
                  datumErsteVeroeffentlichung: "2026-10-30",
                  stellenlokationen: [{ adresse: { ort: "Berlin" } }],
                })),
              })
            )
      )
    const [boardId] = await t.mutation(internal.api.jobs.addSearches, {
      searches: [{ what: "Pflege", where: "Berlin" }],
    })
    const jobs = () => t.run((ctx) => ctx.db.query("jobs").take(10))

    vi.stubGlobal("fetch", feed(["Kept", "Closed"]))
    await t.action(internal.api.jobs.fetchBoard, { boardId: boardId! })
    const before = await jobs()
    expect(before.map((j) => j.title)).toEqual(["Kept", "Closed"])

    vi.stubGlobal("fetch", feed(["Kept, renamed"]))
    await t.action(internal.api.jobs.fetchBoard, { boardId: boardId! })
    const after = await jobs()
    expect(after.map((j) => [j._id, j.title])).toEqual([[before[0]?._id, "Kept, renamed"]])

    // A feed that's down says nothing about what's closed.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: 404 }))
    )
    await t.action(internal.api.jobs.fetchBoard, { boardId: boardId! })
    expect(await jobs()).toHaveLength(1)
  })

  it("adds each search once, and forgets one with no roles", async () => {
    const { t, as } = await setup()
    const searches = [{ what: "Lagerist", where: "München" }]
    const [boardId] = await t.mutation(internal.api.jobs.addSearches, { searches })
    expect(await t.mutation(internal.api.jobs.addSearches, { searches })).toEqual([])
    const b = await t.run((ctx) => ctx.db.get("jobBoards", boardId!))
    expect(b).toMatchObject({
      kind: "arbeitsagentur",
      slug: "lagerist|münchen",
      company: "Arbeitsagentur: Lagerist, München",
    })
    expect(await as.query(api.api.jobs.stats, {})).toEqual({ boards: 1, jobs: 0 })
    // A failed fetch doesn't count as none.
    await t.mutation(internal.api.jobs.boardFetched, {
      boardId: boardId!,
      jobs: 0,
      error: "Down",
    })
    expect(await t.run((ctx) => ctx.db.get("jobBoards", boardId!))).not.toBeNull()
    await t.mutation(internal.api.jobs.boardFetched, { boardId: boardId!, jobs: 0 })
    expect(await t.run((ctx) => ctx.db.get("jobBoards", boardId!))).toBeNull()
    expect(await as.query(api.api.jobs.stats, {})).toEqual({ boards: 0, jobs: 0 })
  })
})

describe("duplicates", () => {
  const feedJob = (url: string, location = "Manila") => ({
    url,
    title: "Support Specialist",
    company: "Coinbase",
    location,
    remote: false,
    postedAt: 1,
    text: "Support Specialist at Coinbase",
  })
  const lead = (userId: Id<"users">, urlKey: string, roleKey?: string) => ({
    userId,
    url: `https://${urlKey}`,
    urlKey,
    ...(roleKey && { roleKey }),
    title: "Support Specialist",
    company: "Coinbase",
    snippet: "",
    fit: 80,
    reasons: [],
    status: "new" as const,
    verdict: "fit" as const,
  })
  const pick = (t: ReturnType<typeof convexTest>, userId: Id<"users">) =>
    t.query(internal.api.jobs.candidates, {
      userId,
      queries: ["support"],
      remoteOnly: false,
      companies: [],
      limit: 10,
    })

  const save = async (t: ReturnType<typeof convexTest>, jobs: ReturnType<typeof feedJob>[]) => {
    const boardId = await t.run((ctx) => ctx.db.insert("jobBoards", board(1, 0)))
    await t.mutation(internal.api.jobs.saveJobs, { boardId, jobs })
    return boardId
  }
  const owner = (t: ReturnType<typeof convexTest>) =>
    t.run((ctx) => ctx.db.insert("users", { name: "Pat" }))

  it("saves a Greenhouse posting once, whichever link the feed gives", async () => {
    const { t } = await setup()
    await save(t, [
      feedJob("https://www.coinbase.com/careers/positions/1?gh_jid=1"),
      feedJob("https://job-boards.greenhouse.io/coinbase/jobs/1"),
    ])
    const jobs = await t.run((ctx) => ctx.db.query("jobs").take(5))
    expect(jobs.map((j) => j.urlKey)).toEqual(["greenhouse/1"])
  })

  it("gives a loop one posting of a role, and each place's role its own", async () => {
    const { t } = await setup()
    const userId = await owner(t)
    await save(t, [
      feedJob("https://x.dev/a?gh_jid=1"),
      feedJob("https://x.dev/a?gh_jid=2"),
      feedJob("https://x.dev/a?gh_jid=3", "Hyderabad"),
    ])
    expect(await pick(t, userId)).toHaveLength(2)
  })

  it("picks a role's newer posting when an older one is too old", async () => {
    const { t } = await setup()
    const userId = await owner(t)
    await save(t, [
      { ...feedJob("https://x.dev/a?gh_jid=1"), postedAt: 1 },
      { ...feedJob("https://x.dev/a?gh_jid=2"), postedAt: 100 },
    ])
    const picked = await t.query(internal.api.jobs.candidates, {
      userId,
      queries: ["support"],
      remoteOnly: false,
      companies: [],
      since: 50,
      limit: 10,
    })
    const jobs = await t.run((ctx) => Promise.all(picked.map((id) => ctx.db.get("jobs", id))))
    expect(jobs.map((j) => j?.urlKey)).toEqual(["greenhouse/2"])
  })

  it("looks past the top matches when the person has seen them", async () => {
    const { t } = await setup()
    const userId = await owner(t)
    const roles = ["One", "Two", "Three", "Four"].map((n, i) => ({
      ...feedJob(`https://x.dev/a?gh_jid=${i + 1}`),
      title: `Support ${n}`,
    }))
    await save(t, roles)
    await t.run(async (ctx) => {
      for (const [i, role] of roles.slice(0, 3).entries())
        await ctx.db.insert("jobLeads", lead(userId, `greenhouse/${i + 1}`, role.title))
    })
    const picked = await t.query(internal.api.jobs.candidates, {
      userId,
      queries: ["support"],
      remoteOnly: false,
      companies: [],
      limit: 1,
    })
    const jobs = await t.run((ctx) => Promise.all(picked.map((id) => ctx.db.get("jobs", id))))
    expect(jobs.map((j) => j?.urlKey)).toEqual(["greenhouse/4"])
  })

  it("skips another posting of a role the person was shown", async () => {
    const { t } = await setup()
    const userId = await owner(t)
    await save(t, [feedJob("https://x.dev/a?gh_jid=2")])
    await t.run((ctx) =>
      ctx.db.insert("jobLeads", lead(userId, "greenhouse/1", "coinbase|support specialist|manila"))
    )
    expect(await pick(t, userId)).toEqual([])
  })

  it("moves stored postings to the new keys, keeping leads on their role", async () => {
    const { t } = await setup()
    const userId = await owner(t)
    const url = "https://www.coinbase.com/careers/positions/1?gh_jid=1"
    const boardId = await t.run((ctx) => ctx.db.insert("jobBoards", board(1, 0)))
    const oldKey = "coinbase.com/careers/positions/1?gh_jid=1"
    const jobId = await t.run((ctx) =>
      ctx.db.insert("jobs", { ...feedJob(url), boardId, urlKey: oldKey, seenAt: 1 })
    )
    // A refresh got there first, so this one has a newer copy to give way to.
    const stale = await t.run((ctx) =>
      ctx.db.insert("jobs", {
        ...feedJob("https://job-boards.greenhouse.io/coinbase/jobs/1"),
        boardId,
        urlKey: "job-boards.greenhouse.io/coinbase/jobs/1",
        seenAt: 1,
      })
    )
    const leadId = await t.run((ctx) =>
      ctx.db.insert("jobLeads", {
        ...lead(userId, "job-boards.greenhouse.io/coinbase/jobs/1"),
        url: "https://job-boards.greenhouse.io/coinbase/jobs/1",
        location: "Manila",
      })
    )
    const prefillId = await t.run((ctx) =>
      ctx.db.insert("prefills", {
        userId,
        url,
        urlKey: oldKey,
        company: "Coinbase",
        title: "Support Specialist",
        status: "ready",
        fields: [],
      })
    )

    expect(await t.query(internal.api.migrations.postingKeysLeft, {})).toBe(2)
    await t.mutation(internal.api.migrations.fillPostingKeys, {})
    await t.finishAllScheduledFunctions(() => undefined)

    expect(await t.query(internal.api.migrations.postingKeysLeft, {})).toBe(0)
    const { kept, gone, moved, prefill } = await t.run(async (ctx) => ({
      kept: await ctx.db.get("jobs", jobId),
      gone: await ctx.db.get("jobs", stale),
      moved: await ctx.db.get("jobLeads", leadId),
      prefill: await ctx.db.get("prefills", prefillId),
    }))
    expect(kept?.urlKey).toBe("greenhouse/1")
    expect(gone).toBeNull()
    expect(moved).toMatchObject({
      urlKey: "greenhouse/1",
      roleKey: "coinbase|support specialist|manila",
      jobId,
    })
    expect(prefill?.urlKey).toBe("greenhouse/1")
  })
})

describe("domains", () => {
  const opts = { numItems: 25, cursor: null }

  const withDomains = async () => {
    const { t, as } = await setup()
    await t.run(async (ctx) => {
      const site = async (n: number, jobs: number, domain?: string, link?: "postings" | "name") => {
        const companyId = domain
          ? await ctx.db.insert("companies", { name: `Company ${n}`, domain })
          : undefined
        const boardId = await ctx.db.insert("jobBoards", {
          ...board(n, jobs),
          companyId,
          companyLink: link,
        })
        for (let i = 0; i < jobs; i++)
          await ctx.db.insert("jobs", {
            boardId,
            urlKey: `${n}/${i}`,
            url: `https://example.com/${n}/${i}`,
            title: `Role ${n}`,
            company: `Company ${n}`,
            location: "Berlin",
            remote: n === 2,
            postedAt: n * 100 + i,
            text: `Role ${n} engineer`,
          })
      }
      await site(1, 3, "stripe.com", "postings")
      await site(2, 2, "hooli.ai", "name")
      await site(3, 1)
      await ctx.db.insert("jobCatalog", { boards: 3, jobs: 6 })
    })
    const titles = async (args: {
      proof?: "own" | "name" | "unverified"
      ending?: string
      q?: string
      remoteOnly?: boolean
    }) =>
      (await as.query(api.api.jobs.search, { paginationOpts: opts, ...args })).page.map(
        (j) => j.title
      )
    return { t, as, titles }
  }

  it("filters by how a role ties to a company, newest first", async () => {
    const { titles } = await withDomains()
    expect(await titles({ proof: "own" })).toEqual(["Role 1", "Role 1", "Role 1"])
    expect(await titles({ proof: "name" })).toEqual(["Role 2", "Role 2"])
    expect(await titles({ proof: "unverified" })).toEqual(["Role 3"])
  })

  it("filters by domain ending, leaving out roles with no site", async () => {
    const { titles } = await withDomains()
    expect(await titles({ ending: ".ai" })).toEqual(["Role 2", "Role 2"])
    expect(await titles({ ending: ".com" })).toEqual(["Role 1", "Role 1", "Role 1"])
    expect(await titles({ ending: ".io" })).toEqual([])
  })

  it("combines those with the other filters and a search", async () => {
    const { titles } = await withDomains()
    expect(await titles({ proof: "own", remoteOnly: true })).toEqual([])
    expect(await titles({ proof: "name", remoteOnly: true })).toEqual(["Role 2", "Role 2"])
    expect(await titles({ ending: ".ai", q: "engineer" })).toEqual(["Role 2", "Role 2"])
  })

  it("stops looking at the scan limit and lets the next page carry on", async () => {
    const { t, as } = await setup()
    await t.run(async (ctx) => {
      const boardId = await ctx.db.insert("jobBoards", board(1, 501))
      for (let i = 0; i < 501; i++)
        await ctx.db.insert("jobs", {
          boardId,
          urlKey: `${i}`,
          url: `https://example.com/${i}`,
          title: `Role ${i}`,
          company: "Company 1",
          location: "Berlin",
          remote: false,
          postedAt: i,
          text: "Role",
        })
    })
    const first = await as.query(api.api.jobs.search, { paginationOpts: opts, proof: "own" })
    expect(first.page).toEqual([])
    expect(first.isDone).toBe(false)
    const next = await as.query(api.api.jobs.search, {
      paginationOpts: { numItems: 25, cursor: first.continueCursor },
      proof: "own",
    })
    expect(next.isDone).toBe(true)
  })

  it("counts a company's open roles, and none for a board of many companies", async () => {
    const { t, as } = await withDomains()
    await t.run(async (ctx) => {
      const company = await ctx.db
        .query("companies")
        .withIndex("by_domain", (q) => q.eq("domain", "stripe.com"))
        .first()
      await ctx.db.insert("jobBoards", { ...board(9, 40), companyId: company!._id })
      const boardId = await ctx.db.insert("jobBoards", {
        kind: "remoteok",
        slug: "all",
        company: "Remote OK",
        addedAt: 0,
        jobs: 900,
      })
      await ctx.db.insert("jobs", {
        boardId,
        urlKey: "remote",
        url: "https://example.com/remote",
        title: "Remote role",
        company: "Wren",
        location: "",
        remote: true,
        postedAt: 9999,
        text: "Remote role",
      })
    })
    const { page } = await as.query(api.api.jobs.search, { paginationOpts: opts })
    expect(page.find((j) => j.title === "Remote role")?.evidence.open).toBeNull()
    expect(page.find((j) => j.title === "Role 1")?.evidence.open).toBe(43)
    expect(page.find((j) => j.title === "Role 3")?.evidence.open).toBe(1)
  })

  it("keeps a summary of the catalog, and writes only when it changes", async () => {
    const { t } = await withDomains()
    expect((await t.query(api.api.jobs.stats, {}))?.summary).toBeUndefined()
    await t.mutation(internal.api.jobs.summarizeCatalog, {})
    expect((await t.query(api.api.jobs.stats, {}))?.summary).toEqual({
      domains: 2,
      own: 3,
      name: 2,
      unverified: 1,
      endings: [
        { ending: ".com", jobs: 3 },
        { ending: ".ai", jobs: 2 },
      ],
    })
    const written = await t.run(async (ctx) => (await ctx.db.query("jobCatalog").first())!)
    await t.mutation(internal.api.jobs.summarizeCatalog, {})
    const again = await t.run(async (ctx) => (await ctx.db.query("jobCatalog").first())!)
    expect(again).toEqual(written)
  })

  it("names each board's domain in the filter", async () => {
    const { as } = await withDomains()
    const companies = await as.query(api.api.jobs.companies, {})
    expect(companies.map((c) => c.domain)).toEqual(["stripe.com", "hooli.ai", null])
  })
})

describe("the company filter", () => {
  it("lists the 200 with the most roles, past the old limit, without empty boards", async () => {
    const { t, as } = await setup()
    await t.run(async (ctx) => {
      for (let n = 0; n < 1001; n++) await ctx.db.insert("jobBoards", board(n, n % 2 ? n : 0))
    })
    const companies = await as.query(api.api.jobs.companies, {})
    expect(companies).toHaveLength(200)
    expect(companies[0]?.jobs).toBe(999)
    expect(companies.at(-1)?.jobs).toBe(999 - 199 * 2)
    expect(companies.every((c) => c.jobs > 0)).toBe(true)
  })

  it("orders the same counts by company", async () => {
    const { t, as } = await setup()
    await t.run(async (ctx) => {
      await ctx.db.insert("jobBoards", board(2, 5))
      await ctx.db.insert("jobBoards", board(1, 5))
    })
    expect((await as.query(api.api.jobs.companies, {})).map((c) => c.company)).toEqual([
      "Company 0001",
      "Company 0002",
    ])
  })
})
