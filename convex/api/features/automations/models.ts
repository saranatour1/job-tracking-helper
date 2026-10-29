import { defineTable } from "convex/server"
import { v } from "convex/values"
import { vRunContext, vStep, vTrigger } from "./validators"

// A workflow someone built. `nextRunAt` is set while a scheduled one is on.
export const automationsTable = defineTable({
  userId: v.id("users"),
  name: v.string(),
  trigger: vTrigger,
  steps: v.array(vStep),
  active: v.boolean(),
  nextRunAt: v.optional(v.number()),
})
  .index("by_userId", ["userId"])
  .index("by_active_and_nextRunAt", ["active", "nextRunAt"])

export const runStatuses = ["running", "done", "failed", "canceled"] as const
export const stepStatuses = ["running", "waiting", "done", "failed"] as const

// What happened at one step, for the run's history. `at` is its place, like "2.1.0"
// (see stepAt); `output` is what it said or did.
export const vLogEntry = v.object({
  at: v.string(),
  kind: v.string(),
  status: v.union(...stepStatuses.map((s) => v.literal(s))),
  startedAt: v.number(),
  finishedAt: v.optional(v.number()),
  output: v.optional(v.string()),
  error: v.optional(v.string()),
  // Ask Jev: the answer Jev picked, which is the path that ran.
  choice: v.optional(v.string()),
})

// One run. Its steps are copied in when it starts, so editing the workflow never
// changes a run that's already going.
export const automationRunsTable = defineTable({
  automationId: v.id("automations"),
  userId: v.id("users"),
  name: v.string(),
  trigger: v.union(v.literal("manual"), v.literal("schedule"), v.literal("event")),
  // For a run an event started: what the event was about.
  context: v.optional(vRunContext),
  steps: v.array(vStep),
  status: v.union(...runStatuses.map((s) => v.literal(s))),
  workflowId: v.optional(v.string()),
  startedAt: v.number(),
  finishedAt: v.optional(v.number()),
  log: v.array(vLogEntry),
  error: v.optional(v.string()),
})
  .index("by_automationId_and_startedAt", ["automationId", "startedAt"])
  .index("by_userId_and_status", ["userId", "status"])
