import { v } from "convex/values"
import { internalAction } from "../../../_generated/server"
import { workLog } from "../../../lib/log"
import { companyFromUrl, keepFrom, type Posting, score, urlKey } from "./fit"
import { limits, readAtOnce } from "./manager"
import { apiKeyOf, sources } from "./sources"
import { OutOfCredits } from "./sources/source"
import { vCriteria, vKept, vPosting, vProvider } from "./validators"

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
        const result = await sources[provider].search(apiKey, query, perQuery, postedToday)
        credits += result.credits
        for (const posting of result.postings) {
          const key = URL.canParse(posting.url) ? urlKey(posting.url) : undefined
          if (key && !found.has(key)) found.set(key, posting)
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

// One batch: read each posting, score it, and keep the best `keep` that fit. Reads
// `readAtOnce` at a time and stops early if the source runs out of credits.
const read = internalAction({
  args: {
    provider: vProvider,
    postings: v.array(vPosting),
    criteria: vCriteria,
    keep: v.number(),
  },
  returns: v.object({
    kept: v.array(vKept),
    scanned: v.number(),
    credits: v.number(),
    outOfCredits: v.boolean(),
    note: v.optional(v.string()),
  }),
  handler: async (ctx, { provider, postings, criteria, keep }) => {
    const log = workLog("loop.read", { provider, postings: postings.length, keep })
    const apiKey = apiKeyOf(provider) ?? ""
    const queue = [...postings]
    const kept: (typeof vKept.type)[] = []
    const rejected: Record<string, number> = {}
    let scanned = 0
    let credits = 0
    let failed = 0
    let outOfCredits = false
    const worker = async () => {
      while (queue.length && !outOfCredits) {
        const posting = queue.shift()!
        try {
          await turn(ctx, provider)
          const page = await sources[provider].read(apiKey, posting.url)
          credits += page.credits
          scanned++
          const fit = score(criteria, { ...posting, text: page.text })
          if ("rejected" in fit) rejected[fit.rejected] = (rejected[fit.rejected] ?? 0) + 1
          else if (fit.fit >= keepFrom)
            kept.push({
              url: posting.url,
              urlKey: urlKey(posting.url),
              title: posting.title || "Untitled role",
              company: companyFromUrl(posting.url),
              snippet: posting.snippet.slice(0, 300),
              ...fit,
            })
        } catch (error) {
          if (error instanceof OutOfCredits) outOfCredits = true
          else failed++
        }
      }
    }
    await Promise.all(Array.from({ length: readAtOnce }, worker))
    const best = kept.sort((a, b) => b.fit - a.fit).slice(0, keep)
    const note = outOfCredits
      ? `Ran out of credits after ${scanned} postings; kept what it had.`
      : failed
        ? `Couldn't read ${failed} of ${postings.length} postings.`
        : undefined
    log.set({ scanned, kept: best.length, credits, failed, outOfCredits, rejected })
    log.emit()
    return { kept: best, scanned, credits, outOfCredits, note }
  },
})

export const actionsApi = { search, read }
