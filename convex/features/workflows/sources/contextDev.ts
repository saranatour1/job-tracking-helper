import { count, post, record, type Source, text } from "./source"

// context.dev. Search costs 1 credit per 10 results; it answers 401 with error_code
// USAGE_EXCEEDED when the credits are used up.
const outOfCredits = (status: number, json: unknown) =>
  status === 402 || (status === 401 && record(json).error_code === "USAGE_EXCEEDED")

const credits = (json: unknown, fallback: number) =>
  count(record(record(json).key_metadata).credits_consumed, fallback)

export const parseSearch = (json: unknown, limit: number) => {
  const results = record(json).results
  const postings = (Array.isArray(results) ? results : [])
    .map((r) => record(r))
    .map((r) => ({ url: text(r.url), title: text(r.title), snippet: text(r.description) }))
    .filter((p) => p.url.startsWith("http"))
  return { postings, credits: credits(json, Math.ceil(limit / 10)) }
}

export const contextDev: Source = {
  search: async (apiKey, query, limit, postedToday, domains) =>
    parseSearch(
      await post(
        "https://api.context.dev/v1/web/search",
        apiKey,
        {
          query,
          numResults: limit,
          includeDomains: domains,
          ...(postedToday && { freshness: "last_24_hours" }),
        },
        outOfCredits
      ),
      limit
    ),
}
