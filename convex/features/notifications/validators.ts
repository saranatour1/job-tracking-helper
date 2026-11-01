import { v } from "convex/values"
import { statuses } from "../applications/validators"

export const vInboxLines = v.array(
  v.object({
    id: v.string(),
    title: v.string(),
    message: v.string(),
    at: v.number(),
    unread: v.boolean(),
    link: v.union(v.literal("/pipeline"), v.literal("/loops"), v.literal("/prefilled"), v.null()),
    company: v.optional(v.string()),
    status: v.optional(v.union(...statuses.map((s) => v.literal(s)))),
    run: v.optional(
      v.object({
        automationId: v.id("automations"),
        runId: v.id("automationRuns"),
        startedAt: v.number(),
      })
    ),
  })
)
