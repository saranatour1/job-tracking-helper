import { v } from "convex/values"
import { internal } from "../../../_generated/api"
import type { Provider } from "../loops/catalog"
import { workflow } from "./manager"

// One morning's run of a loop: plan, search, drop postings the person has seen, hand
// the rest to the read pool as one batch and wait for it, then save the best. It tries
// each source in turn, so when one is out of credits the run carries on with the next.
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
      if (fresh.length) {
        await step.runMutation(internal.loops.queueReads, {
          runId,
          provider,
          postings: fresh,
          criteria: plan.criteria,
        })
        // readDone sends this once the pool has finished every read in the batch.
        await step.awaitEvent({ name: "readsDone" })
      }
      await step.runMutation(internal.loops.finishRun, {
        runId,
        provider,
        spent,
        exhausted,
        keep: plan.daily,
      })
      return
    }
    await step.runMutation(internal.loops.finishRun, {
      runId,
      spent,
      exhausted,
      keep: 0,
      note: plan.sources.length ? "Every source ran out of credits during this run." : plan.why,
    })
  },
})

export const workflowApi = { findJobs }
