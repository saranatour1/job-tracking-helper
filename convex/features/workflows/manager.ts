import { DAY, MINUTE, RateLimiter } from "@convex-dev/rate-limiter"
import { WorkflowManager } from "@convex-dev/workflow"
import { Workpool } from "@convex-dev/workpool"
import { components } from "../../_generated/api"

// Runs each loop's steps on the workflow component's own workpool. Steps are batches
// (one search, one handoff of every role to Jev), so 10 at a time is plenty.
export const workflow = new WorkflowManager(components.workflow, {
  workpoolOptions: { maxParallelism: 10 },
})

// Calls to each source, shared by every run, and how often a person can run a loop by
// hand or check a pasted link. context.dev's free plan allows 2 requests at once, hence
// its small burst.
export const limits = new RateLimiter(components.rateLimiter, {
  firecrawl: { kind: "token bucket", rate: 60, period: MINUTE, capacity: 5 },
  contextDev: { kind: "token bucket", rate: 60, period: MINUTE, capacity: 2 },
  runNow: { kind: "fixed window", rate: 3, period: DAY },
  checkLink: { kind: "fixed window", rate: 10, period: DAY },
  // Workflows people build, started by hand.
  automationRun: { kind: "fixed window", rate: 50, period: DAY },
  // Workflows started by emails, status changes and bookings.
  automationEvent: { kind: "fixed window", rate: 200, period: DAY },
  // Find roles and Send email steps: each spends search credits, Jev or someone's inbox.
  automationFind: { kind: "fixed window", rate: 5, period: DAY },
  automationEmail: { kind: "fixed window", rate: 20, period: DAY },
  automationDescribe: { kind: "fixed window", rate: 20, period: DAY },
  // Re-evaluating a goal asks Jev about every application.
  goalEvaluate: { kind: "fixed window", rate: 10, period: DAY },
  // Reviewing a resume parses it and asks Jev a batch of questions.
  resumeReview: { kind: "fixed window", rate: 10, period: DAY },
  // Applications prepared; each spends Firecrawl credits and Jev.
  prepare: { kind: "fixed window", rate: 10, period: DAY },
})

// The batch worker: it fetches job boards for the catalog, and every run hands it the
// roles for Jev to judge in one batch. 8 at a time across everything; each job
// retries twice before it counts as failed.
export const readPool = new Workpool(components.readPool, {
  maxParallelism: 8,
  retryActionsByDefault: true,
  defaultRetryBehavior: { maxAttempts: 3, initialBackoffMs: 1000, base: 2 },
})

// Auto-apply runs drive a form in a browser and submit it, so a run that dies is never
// tried again by itself: the row says so, and the person decides.
export const applyPool = new Workpool(components.applyPool, {
  maxParallelism: 2,
  retryActionsByDefault: false,
})
