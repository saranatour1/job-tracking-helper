import { v } from "convex/values"
import { statuses } from "../applications/validators"

export const vInboxLines = v.array(
  v.object({
    id: v.string(),
    title: v.string(),
    message: v.string(),
    at: v.number(),
    unread: v.boolean(),
    // Where its button goes; none for a line with nowhere better to go.
    link: v.union(
      v.literal("/"),
      v.literal("/loops"),
      v.literal("/calendar"),
      v.literal("/prefilled"),
      v.null()
    ),
    company: v.optional(v.string()),
    status: v.optional(v.union(...statuses.map((s) => v.literal(s)))),
    // For a workflow's message: the run it came from, to open its history.
    run: v.optional(
      v.object({
        automationId: v.id("automations"),
        runId: v.id("automationRuns"),
        startedAt: v.number(),
      })
    ),
  })
)
