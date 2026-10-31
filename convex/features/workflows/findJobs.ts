import { v } from "convex/values"
import { internal } from "../../_generated/api"
import type { Provider } from "../loops/catalog"
import { workflow } from "./manager"

const findJobs = workflow.define({
  args: { runId: v.id("loopRuns") },
  handler: async (step, { runId }): Promise<void> => {
    const plan = await step.runMutation(internal.api.loops.beginRun, {
      runId,
      workflowId: step.workflowId,
    })
    if (!plan) return
    const spent: { provider: Provider; credits: number }[] = []
    const exhausted: Provider[] = []
    let provider: Provider | undefined
    for (const source of plan.sources) {
      const found = await step.runAction(
        internal.api.workflows.search,
        {
          provider: source,
          queries: plan.queries,
          perQuery: plan.perQuery,
          postedToday: plan.postedToday,
        },
        { retry: { maxAttempts: 2, initialBackoffMs: 2000, base: 2 } }
      )
      spent.push({ provider: source, credits: found.credits })
      if (found.outOfCredits) {
        exhausted.push(source)
        continue
      }
      provider = source
      const boards = await step.runMutation(internal.api.jobs.addBoards, {
        urls: found.postings.map((p) => p.url),
      })
      await Promise.all(
        boards.map((boardId) =>
          step
            .runAction(internal.api.jobs.fetchBoard, { boardId }, { retry: true })
            .catch(() => null)
        )
      )
      break
    }
    if (plan.localSearches?.length) {
      const boards = await step.runMutation(internal.api.jobs.addSearches, {
        searches: plan.localSearches,
      })
      await Promise.all(
        boards.map((boardId) =>
          step
            .runAction(internal.api.jobs.fetchBoard, { boardId }, { retry: true })
            .catch(() => null)
        )
      )
    }
    const jobIds = await step.runQuery(internal.api.jobs.candidates, {
      userId: plan.userId,
      queries: plan.queries,
      remoteOnly: plan.remoteOnly,
      companies: plan.companies,
      since: plan.since,
      limit: plan.daily,
    })
    if (jobIds.length) {
      await step.runMutation(internal.api.loops.queueJudging, {
        runId,
        jobIds,
        profile: plan.profile,
      })
      await step.awaitEvent({ name: "judged" })
    }
    await step.runMutation(internal.api.loops.finishRun, { runId, provider, spent, exhausted })
  },
})

export const workflowApi = { findJobs }
