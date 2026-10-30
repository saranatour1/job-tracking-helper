import { type Infer, v } from "convex/values"
import type { Doc } from "../../_generated/dataModel"
import { internalAction } from "../../_generated/server"
import { workLog } from "../../lib/log"
import { convexGateway } from "@convex-dev/ai-sdk-provider"
import { experimental_decide as decide } from "ai"
import { internal } from "../../_generated/api"
import { previewOf } from "../jobs/boards"
import { isPostingUrl, jobBoards, type Posting, urlKey } from "./fit"
import {
  checksOf,
  jevModel,
  type JudgedJob,
  type Outcome,
  type Profile,
  questionsOf,
  specsOf,
  stateOf,
  verdictOf,
} from "./judge"
import { limits } from "./manager"
import { apiKeyOf, sources } from "./sources"
import { OutOfCredits } from "./sources/source"
import { vJudgeResult, vPosting, vProfile, vProvider } from "./validators"

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

// Asks Jev about one role through the Convex AI gateway: the overall match and one
// question per thing the person asked for, all in one request.
export const judge = async (profile: Profile, job: JudgedJob) => {
  const result = await decide({
    model: convexGateway.evaluationModel(jevModel),
    state: stateOf(profile, job),
    questions: questionsOf(profile),
  })
  const answers = result.answers as Record<
    string,
    { score?: number; choice?: string; probabilities?: Record<string, number> }
  >
  const checks = checksOf(
    profile,
    job,
    specsOf(profile).map((_, i) => {
      const a = answers[`c${i}`]
      const outcome = (a?.choice ?? "unclear") as Outcome
      return { outcome, confidence: a?.probabilities?.[outcome] ?? 0 }
    })
  )
  return {
    cost: Number(result.providerMetadata?.convexGateway?.cost ?? 0),
    ...verdictOf(answers.match?.score ?? 0, checks, result.response.modelId ?? jevModel),
  }
}

// Judges one catalog role for a run. The batch worker runs these and retries a failed
// call twice.
const judgeOne = internalAction({
  args: { jobId: v.id("jobs"), profile: vProfile },
  returns: vJudgeResult,
  handler: async (ctx, { jobId, profile }): Promise<Infer<typeof vJudgeResult>> => {
    const job: Doc<"jobs"> | null = await ctx.runQuery(internal.jobs.get, { jobId })
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
