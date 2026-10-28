import { v } from "convex/values"
import { internal } from "../../../_generated/api"
import type { Provider } from "../loops/catalog"
import { workflow } from "./manager"

// One morning's run of a loop. Each step is a batch: plan, search, drop postings the
// person has seen, read and score, save. It tries each source in turn, so when one is
// out of credits the run carries on with the next.
const findJobs = workflow.define({
  args: { runId: v.id("loopRuns") },
  handler: async (step, { runId }): Promise<void> => {
    const plan = await step.runMutation(internal.loops.beginRun, { runId })
    if (!plan) return
    const spent: { provider: Provider; credits: number }[] = []
    const exhausted: Provider[] = []
    for (const provider of plan.sources) {
      const found = await step.runAction(
        internal.workflows.search,
        {
          provider,
          queries: plan.queries,
          perQuery: plan.perQuery,
          postedToday: plan.postedToday,
        },
        { retry: { maxAttempts: 2, initialBackoffMs: 2000, base: 2 } }
      )
      spent.push({ provider, credits: found.credits })
      if (found.outOfCredits) {
        exhausted.push(provider)
        continue
      }
      const fresh = await step.runQuery(internal.loops.unseen, {
        userId: plan.userId,
        postings: found.postings,
        limit: plan.scan,
      })
      const read = await step.runAction(internal.workflows.read, {
        provider,
        postings: fresh,
        criteria: plan.criteria,
        keep: plan.daily,
      })
      spent.push({ provider, credits: read.credits })
      if (read.outOfCredits) exhausted.push(provider)
      await step.runMutation(internal.loops.finishRun, {
        runId,
        provider,
        scanned: read.scanned,
        kept: read.kept,
        spent,
        exhausted,
        note: read.note,
      })
      return
    }
    await step.runMutation(internal.loops.finishRun, {
      runId,
      scanned: 0,
      kept: [],
      spent,
      exhausted,
      note: plan.sources.length ? "Every source ran out of credits during this run." : plan.why,
    })
  },
})

export const workflowApi = { findJobs }
