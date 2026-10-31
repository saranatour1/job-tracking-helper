import { v } from "convex/values"
import type { Doc } from "../../_generated/dataModel"
import { authedQuery } from "../../lib/functions"
import { keys, linesOf } from "../email/utils"
import { vTimeline } from "../email/validators"
import { maxGoalApplications } from "./validators"

// The page shows the newest 50 of everything, so that's enough of each, and only those are
// decrypted. Mail is looked for among the newest 1,000 in the period.
const activity = authedQuery({
  args: { id: v.id("goals") },
  returns: v.object({
    notes: v.array(v.object({ at: v.number(), who: v.string(), text: v.string() })),
    mail: vTimeline,
  }),
  handler: async (ctx, { id }) => {
    const goal = await ctx.db.get("goals", id)
    if (goal?.userId !== ctx.userId) return { notes: [], mail: [] }
    const from = Date.parse(goal.start)
    const to = Date.parse(goal.target) + 24 * 60 * 60 * 1000
    const applications = (
      await ctx.db
        .query("applications")
        .withIndex("by_userId_and_goalId", (q) => q.eq("userId", ctx.userId).eq("goalId", id))
        .order("desc")
        .take(maxGoalApplications)
    ).filter((a) => a.trashedAt === undefined)
    const notes = applications
      .flatMap((a) => (a.notes ?? []).map((n) => ({ at: n.at, who: a.company, text: n.text })))
      .filter((n) => n.at >= from && n.at < to)
      .sort((a, b) => b.at - a.at)
      .slice(0, 50)
    const ids = new Set(applications.map((a) => a._id))
    const k = await keys().catch(() => null)
    // Dates a goal can hold but that make no range, like a target before the start.
    if (!k || !(from < to)) return { notes, mail: [] }
    const mine: Doc<"mailEvents">[] = []
    let looked = 0
    for await (const e of ctx.db
      .query("mailEvents")
      .withIndex("by_userId_and_at", (q) => q.eq("userId", ctx.userId).gte("at", from).lt("at", to))
      .order("desc")) {
      if (e.applicationId && ids.has(e.applicationId) && e.box !== "trash") mine.push(e)
      if (mine.length >= 50 || ++looked >= 1000) break
    }
    return { notes, mail: await linesOf(k, ctx.userId, mine) }
  },
})

export const activityApi = { activity }
