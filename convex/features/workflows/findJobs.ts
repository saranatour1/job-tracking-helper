import { v } from "convex/values"
import { internal } from "../../_generated/api"
import type { Provider } from "../loops/catalog"
import { workflow } from "./manager"

// One morning's run of a loop. It searches for job boards the catalog doesn't have yet
// and fetches them, trying each source in turn so one out of credits doesn't stop it.
// Then it picks catalog roles the person hasn't been shown, has Jev judge them on the
// batch worker, waits for every verdict, and saves them all.
const findJobs = workflow.define({
  args: { runId: v.id("loopRuns") },
  handler: async (step, { runId }): Promise<void> => {
    const plan = await step.runMutation(internal.loops.beginRun, {
      runId,
      workflowId: step.workflowId,
    })
    if (!plan) return
    const spent: { provider: Provider; credits: number }[] = []
    const exhausted: Provider[] = []
    let provider: Provider | undefined
    for (const source of plan.sources) {
      const found = await step.runAction(
        internal.workflows.search,
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
      const boards = await step.runMutation(internal.jobs.addBoards, {
        urls: found.postings.map((p) => p.url),
      })
      // New boards are fetched now, so this run can already pick from them. One that
      // keeps failing is left for the hourly refresh rather than failing the run.
      await Promise.all(
        boards.map((boardId) =>
          step.runAction(internal.jobs.fetchBoard, { boardId }, { retry: true }).catch(() => null)
        )
      )
      break
    }
    const jobIds = await step.runQuery(internal.jobs.candidates, {
      userId: plan.userId,
      queries: plan.queries,
      remoteOnly: plan.remoteOnly,
      companies: plan.companies,
      since: plan.since,
      limit: plan.daily,
    })
    if (jobIds.length) {
      await step.runMutation(internal.loops.queueJudging, {
        runId,
        jobIds,
        profile: plan.profile,
      })
      // `judged` sends this once the batch worker has finished every judgment.
      await step.awaitEvent({ name: "judged" })
    }
    await step.runMutation(internal.loops.finishRun, { runId, provider, spent, exhausted })
  },
})

export const workflowApi = { findJobs }
