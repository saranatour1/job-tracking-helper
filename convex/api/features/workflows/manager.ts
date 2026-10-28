import { DAY, MINUTE, RateLimiter } from "@convex-dev/rate-limiter"
import { WorkflowManager } from "@convex-dev/workflow"
import { components } from "../../../_generated/api"

// Runs each loop's steps on the workflow component's own workpool. Steps are batches
// (one search, one read of every posting), so 10 at a time is plenty across all runs.
export const workflow = new WorkflowManager(components.workflow, {
  workpoolOptions: { maxParallelism: 10 },
})

// Calls to each source, shared by every run, and how often a person can run a loop by
// hand. context.dev's free plan allows 2 requests at once, hence its small burst.
export const limits = new RateLimiter(components.rateLimiter, {
  firecrawl: { kind: "token bucket", rate: 60, period: MINUTE, capacity: 5 },
  contextDev: { kind: "token bucket", rate: 60, period: MINUTE, capacity: 2 },
  runNow: { kind: "fixed window", rate: 3, period: DAY },
})

// How many postings one run reads at a time.
export const readAtOnce = 2
