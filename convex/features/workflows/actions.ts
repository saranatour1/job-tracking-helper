import { type Infer, v } from "convex/values"
import type { Doc } from "../../_generated/dataModel"
import { internalAction } from "../../_generated/server"
import { workLog } from "../../lib/log"
import { internal } from "../../_generated/api"
import { previewOf } from "../jobs/boards"
import { isPostingUrl, jobBoards, type Posting, urlKey } from "./fit"
import { apiKeyOf, sources } from "./sources"
import { OutOfCredits } from "./sources/source"
import { vJudgeResult, vProfile, vSearchArgs, vSearchResult } from "./validators"
import { turn, judge } from "./utils"

// One batch: every search for a run, with duplicates folded together.
const search = internalAction({
  args: vSearchArgs,
  returns: vSearchResult,
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

// Judges one catalog role for a run. The batch worker runs these and retries a failed
// call twice.
const judgeOne = internalAction({
  args: { jobId: v.id("jobs"), profile: vProfile },
  returns: vJudgeResult,
  handler: async (ctx, { jobId, profile }): Promise<Infer<typeof vJudgeResult>> => {
    const job: Doc<"jobs"> | null = await ctx.runQuery(internal.api.jobs.get, { jobId })
    if (!job) return { cost: 0, judged: null }
    const { cost, ...verdict } = await judge(profile, job)
    return {
      cost,
      judged: {
        jobId,
        url: job.url,
        urlKey: job.urlKey,
        title: job.title,
        company: job.company,
        location: job.location,
        snippet: previewOf(job.text, 300),
        ...verdict,
      },
    }
  },
})

export const actionsApi = { search, judgeOne }
