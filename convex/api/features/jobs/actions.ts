import { NonRetryableError } from "@convex-dev/workpool"
import { v } from "convex/values"
import { internal } from "../../../_generated/api"
import { internalAction } from "../../../_generated/server"
import { workLog } from "../../../lib/log"
import { feedUrl, parseFeed } from "./boards"

// Fetches one board's feed and saves every role on it. The batch worker runs these and
// retries a failed fetch; a board that's gone (404) isn't retried.
const fetchBoard = internalAction({
  args: { boardId: v.id("jobBoards") },
  returns: v.null(),
  handler: async (ctx, { boardId }) => {
    const board = await ctx.runQuery(internal.jobs.board, { boardId })
    if (!board) return null
    const log = workLog("jobs.fetchBoard", { kind: board.kind, slug: board.slug })
    const startedAt = Date.now()
    try {
      const res = await fetch(feedUrl(board.kind, board.slug))
      if (!res.ok) {
        const error = `The feed answered ${res.status}`
        await ctx.runMutation(internal.jobs.boardFetched, { boardId, startedAt, jobs: 0, error })
        if (res.status >= 400 && res.status < 500) throw new NonRetryableError(error)
        throw new Error(error)
      }
      const jobs = parseFeed(board.kind, board.slug, await res.json(), startedAt).filter(
        (j) => j.url.startsWith("https://") && j.title
      )
      for (let i = 0; i < jobs.length; i += 100)
        await ctx.runMutation(internal.jobs.saveJobs, {
          boardId,
          jobs: jobs.slice(i, i + 100),
          seenAt: startedAt,
        })
      await ctx.runMutation(internal.jobs.boardFetched, { boardId, startedAt, jobs: jobs.length })
      log.set({ jobs: jobs.length })
      return null
    } catch (error) {
      log.error(error as Error)
      throw error
    } finally {
      log.emit()
    }
  },
})

export const actionsApi = { fetchBoard }
