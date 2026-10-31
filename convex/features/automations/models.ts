import { defineTable } from "convex/server"
import { v } from "convex/values"
import { vRunContext, vStep, vTrigger, runStatuses, vLogEntry } from "./validators"

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
}).index("by_automationId_and_startedAt", ["automationId", "startedAt"])
