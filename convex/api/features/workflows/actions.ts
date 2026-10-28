import { v } from "convex/values"
import { internalAction } from "../../../_generated/server"
import { workLog } from "../../../lib/log"
import {
  companyFromUrl,
  isPostingUrl,
  jobBoards,
  keepFrom,
  type Posting,
  score,
  urlKey,
} from "./fit"
import { limits } from "./manager"
import { apiKeyOf, sources } from "./sources"
import { OutOfCredits } from "./sources/source"
import { vCriteria, vPosting, vProvider, vRead } from "./validators"

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// Waits for room under the source's shared call limit.
const turn = async (
  ctx: Parameters<typeof limits.limit>[0],
  provider: "firecrawl" | "contextDev"
) => {
  const { retryAfter } = await limits.limit(ctx, provider, { reserve: true })
  if (retryAfter) await sleep(retryAfter)
}

// One batch: every search for a run, with duplicates folded together.
const search = internalAction({
  args: {
    provider: vProvider,
    queries: v.array(v.string()),
    perQuery: v.number(),
    postedToday: v.boolean(),
  },
  returns: v.object({
    postings: v.array(vPosting),
    credits: v.number(),
    outOfCredits: v.boolean(),
  }),
  handler: async (ctx, { provider, queries, perQuery, postedToday }) => {
    const log = workLog("loop.search", { provider, queries: queries.length, perQuery })
    const apiKey = apiKeyOf(provider)
    const found = new Map<string, Posting>()
    let credits = 0
    try {
      if (!apiKey) throw new OutOfCredits(`${provider} has no API key`)
      for (const query of queries) {
        await turn(ctx, provider)
        const result = await sources[provider].search(
          apiKey,
          query,
          perQuery,
          postedToday,
          jobBoards
        )
        credits += result.credits
        // Only single postings get read; board front pages and lists are dropped here.
        for (const posting of result.postings.filter((p) => isPostingUrl(p.url))) {
          const key = urlKey(posting.url)
          if (!found.has(key)) found.set(key, posting)
        }
      }
      log.set({ found: found.size, credits })
      return { postings: [...found.values()], credits, outOfCredits: false }
    } catch (error) {
      if (!(error instanceof OutOfCredits)) {
        log.error(error as Error)
        throw error
      }
      log.set({ outOfCredits: true, credits })
      return { postings: [], credits, outOfCredits: true }
    } finally {
      log.emit()
    }
  },
})

// Reads and scores one posting. The read pool runs these, at most 2 at a time across
// every run, and retries a failed read twice; running out of credits isn't retried.
const readOne = internalAction({
  args: { provider: vProvider, posting: vPosting, criteria: vCriteria },
  returns: vRead,
  handler: async (ctx, { provider, posting, criteria }) => {
    const apiKey = apiKeyOf(provider)
    if (!apiKey) return { credits: 0, outOfCredits: true, kept: null }
    try {
      await turn(ctx, provider)
      const page = await sources[provider].read(apiKey, posting.url)
      const fit = score(criteria, { ...posting, text: page.text })
      if ("rejected" in fit)
        return { credits: page.credits, outOfCredits: false, kept: null, rejected: fit.rejected }
      return {
        credits: page.credits,
        outOfCredits: false,
        kept:
          fit.fit >= keepFrom
            ? {
                url: posting.url,
                urlKey: urlKey(posting.url),
                title: posting.title || "Untitled role",
                company: companyFromUrl(posting.url),
                snippet: posting.snippet.slice(0, 300),
                ...fit,
              }
            : null,
      }
    } catch (error) {
      if (error instanceof OutOfCredits) return { credits: 0, outOfCredits: true, kept: null }
      throw error
    }
  },
})

export const actionsApi = { search, readOne }
