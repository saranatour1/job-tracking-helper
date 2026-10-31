import { defineTable } from "convex/server"
import { v } from "convex/values"
import { vRunContext, vStep, vTrigger, runStatuses, vLogEntry } from "./validators"

export const automationsTable = defineTable({
  userId: v.id("users"),
  name: v.string(),
  trigger: vTrigger,
  steps: v.array(vStep),
  active: v.boolean(),
  nextRunAt: v.optional(v.number()),
  // Written by a connected agent and not yet saved in the builder, so it can't start.
  byAgent: v.optional(v.boolean()),
})
  .index("by_userId", ["userId"])
  .index("by_active_and_nextRunAt", ["active", "nextRunAt"])

export const automationRunsTable = defineTable({
  automationId: v.id("automations"),
  userId: v.id("users"),
  name: v.string(),
  trigger: v.union(v.literal("manual"), v.literal("schedule"), v.literal("event")),
  context: v.optional(vRunContext),
  steps: v.array(vStep),
  status: v.union(...runStatuses.map((s) => v.literal(s))),
  workflowId: v.optional(v.string()),
  startedAt: v.number(),
  finishedAt: v.optional(v.number()),
  log: v.array(vLogEntry),
  error: v.optional(v.string()),
}).index("by_automationId_and_startedAt", ["automationId", "startedAt"])
