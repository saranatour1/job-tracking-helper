import { DAY, MINUTE, RateLimiter } from "@convex-dev/rate-limiter"
import { WorkflowManager } from "@convex-dev/workflow"
import { Workpool } from "@convex-dev/workpool"
import { components } from "../../_generated/api"

export const workflow = new WorkflowManager(components.workflow, {
  workpoolOptions: { maxParallelism: 10 },
})

// Calls to each source, shared by every run, and how often a person can run a loop by
// hand or check a pasted link. context.dev's free plan allows 2 requests at once, hence
// its small burst.
export const limits = new RateLimiter(components.rateLimiter, {
  firecrawl: { kind: "token bucket", rate: 60, period: MINUTE, capacity: 5 },
  contextDev: { kind: "token bucket", rate: 60, period: MINUTE, capacity: 2 },
  // Under Firecrawl's free-plan limit of 5 searches a minute, so loops keep their share.
  companySearch: { kind: "token bucket", rate: 4, period: MINUTE, capacity: 1 },
  runNow: { kind: "fixed window", rate: 3, period: DAY },
  checkLink: { kind: "fixed window", rate: 10, period: DAY },
  automationRun: { kind: "fixed window", rate: 50, period: DAY },
  automationEvent: { kind: "fixed window", rate: 200, period: DAY },
  automationFind: { kind: "fixed window", rate: 5, period: DAY },
  automationEmail: { kind: "fixed window", rate: 20, period: DAY },
  automationDescribe: { kind: "fixed window", rate: 20, period: DAY },
  goalEvaluate: { kind: "fixed window", rate: 10, period: DAY },
  resumeReview: { kind: "fixed window", rate: 10, period: DAY },
  prepare: { kind: "fixed window", rate: 10, period: DAY },
  agentNotify: { kind: "fixed window", rate: 20, period: DAY },
  agentContact: { kind: "fixed window", rate: 100, period: DAY },
  // Shards, since agents call tools side by side and one counter would make them collide.
  agentRead: { kind: "token bucket", rate: 120, period: MINUTE, capacity: 120, shards: 10 },
  agentWrite: { kind: "fixed window", rate: 500, period: DAY, shards: 5 },
})

export const readPool = new Workpool(components.readPool, {
  maxParallelism: 8,
  retryActionsByDefault: true,
  defaultRetryBehavior: { maxAttempts: 3, initialBackoffMs: 1000, base: 2 },
})

export const applyPool = new Workpool(components.applyPool, {
  maxParallelism: 2,
  retryActionsByDefault: false,
})
