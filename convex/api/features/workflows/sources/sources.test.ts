import { afterEach, describe, expect, it, vi } from "vite-plus/test"

import * as contextDevApi from "./contextDev"
import * as firecrawlApi from "./firecrawl"
import { isNonRetryableError } from "@convex-dev/workpool"
import { OutOfCredits } from "./source"

afterEach(() => vi.unstubAllGlobals())

const answer = (status: number, body: unknown) =>
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(body), { status }))
  )

describe("Firecrawl", () => {
  it("reads search results and the credits they cost", () => {
    expect(
      firecrawlApi.parseSearch(
        {
          success: true,
          data: {
            web: [
              { url: "https://a.dev/j", title: "Engineer", description: "Remote" },
              { title: "no url" },
            ],
          },
          creditsUsed: 2,
        },
        10
      )
    ).toEqual({
      postings: [{ url: "https://a.dev/j", title: "Engineer", snippet: "Remote" }],
      credits: 2,
    })
  })

  it("estimates credits and survives a reply in an unexpected shape", () => {
    expect(firecrawlApi.parseSearch({ data: "nope" }, 20)).toEqual({ postings: [], credits: 4 })
    expect(firecrawlApi.parseRead(null)).toEqual({ text: "", credits: 1 })
  })

  it("treats 402 as out of credits", async () => {
    answer(402, { error: "Payment required" })
    await expect(firecrawlApi.firecrawl.search("key", "q", 10, false, [])).rejects.toBeInstanceOf(
      OutOfCredits
    )
  })
})

describe("refusals and job boards", () => {
  it("doesn't retry a page a site refuses, but does retry rate limits", async () => {
    answer(403, {})
    const refused = await firecrawlApi.firecrawl
      .read("key", "https://x.dev")
      .catch((e: unknown) => e)
    expect(isNonRetryableError(refused)).toBe(true)
    answer(429, {})
    const limited = await firecrawlApi.firecrawl
      .read("key", "https://x.dev")
      .catch((e: unknown) => e)
    expect(isNonRetryableError(limited)).toBe(false)
  })

  it("searches Firecrawl on the job boards only", async () => {
    answer(200, { data: { web: [] } })
    await firecrawlApi.firecrawl.search("key", "climate remote", 10, false, [
      "jobs.lever.co",
      "jobs.ashbyhq.com",
    ])
    const body = JSON.parse(vi.mocked(fetch).mock.calls[0]![1]!.body as string)
    expect(body.query).toBe("climate remote (site:jobs.lever.co OR site:jobs.ashbyhq.com)")
  })
})

describe("context.dev", () => {
  it("reads search results, a scraped page and the credits charged", () => {
    expect(
      contextDevApi.parseSearch(
        {
          results: [{ url: "https://b.dev/j", title: "Designer", description: "" }],
          key_metadata: { credits_consumed: 1 },
        },
        10
      )
    ).toEqual({
      postings: [{ url: "https://b.dev/j", title: "Designer", snippet: "" }],
      credits: 1,
    })
    expect(
      contextDevApi.parseRead({
        markdown: { data: "# Designer" },
        key_metadata: { credits_consumed: 1 },
      })
    ).toEqual({ text: "# Designer", credits: 1 })
  })

  it("treats USAGE_EXCEEDED as out of credits, but not other 401s", async () => {
    answer(401, { error_code: "USAGE_EXCEEDED" })
    await expect(contextDevApi.contextDev.read("key", "https://b.dev")).rejects.toBeInstanceOf(
      OutOfCredits
    )
    answer(401, { error_code: "INVALID_API_KEY" })
    const error = await contextDevApi.contextDev
      .read("key", "https://b.dev")
      .catch((e: unknown) => e)
    expect(error).not.toBeInstanceOf(OutOfCredits)
  })

  it("sends freshness only for loops that want today's postings", async () => {
    answer(200, { results: [] })
    await contextDevApi.contextDev.search("key", "q", 10, true, ["jobs.lever.co"])
    const body = JSON.parse(vi.mocked(fetch).mock.calls[0]![1]!.body as string)
    expect(body).toEqual({
      query: "q",
      numResults: 10,
      includeDomains: ["jobs.lever.co"],
      freshness: "last_24_hours",
    })
  })
})
