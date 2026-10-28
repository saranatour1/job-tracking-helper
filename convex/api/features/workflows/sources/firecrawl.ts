import { count, maxText, post, record, type Source, text } from "./source"

// Firecrawl v2. Search costs about 2 credits per 10 results and a scrape 1 credit;
// it answers 402 when the plan's credits are used up.
const outOfCredits = (status: number) => status === 402

export const parseSearch = (json: unknown, limit: number) => {
  const body = record(json)
  const results = record(body.data).web
  const postings = (Array.isArray(results) ? results : [])
    .map((r) => record(r))
    .map((r) => ({ url: text(r.url), title: text(r.title), snippet: text(r.description) }))
    .filter((p) => p.url.startsWith("http"))
  return { postings, credits: count(body.creditsUsed, Math.ceil(limit / 10) * 2) }
}

export const parseRead = (json: unknown) => {
  const data = record(record(json).data)
  return {
    text: text(data.markdown).slice(0, maxText),
    credits: count(record(data.metadata).creditsUsed, 1),
  }
}

export const firecrawl: Source = {
  search: async (apiKey, query, limit, postedToday, domains) =>
    parseSearch(
      await post(
        "https://api.firecrawl.dev/v2/search",
        apiKey,
        {
          query: `${query} (${domains.map((d) => `site:${d}`).join(" OR ")})`,
          limit,
          ...(postedToday && { tbs: "qdr:d" }),
        },
        outOfCredits
      ),
      limit
    ),
  read: async (apiKey, url) =>
    parseRead(
      await post(
        "https://api.firecrawl.dev/v2/scrape",
        apiKey,
        { url, formats: ["markdown"], onlyMainContent: true },
        outOfCredits
      )
    ),
}
