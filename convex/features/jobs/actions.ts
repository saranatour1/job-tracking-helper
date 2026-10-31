import { v } from "convex/values"
import { internal } from "../../_generated/api"
import { internalAction } from "../../_generated/server"
import { workLog } from "../../lib/log"
import { feedUrl, parseFeed } from "./boards"

const fetchBoard = internalAction({
  args: { boardId: v.id("jobBoards") },
  returns: v.null(),
  handler: async (ctx, { boardId }) => {
    const board = await ctx.runQuery(internal.api.jobs.board, { boardId })
    if (!board) return null
    const log = workLog("jobs.fetchBoard", { kind: board.kind, slug: board.slug })
    const startedAt = Date.now()
    try {
      const res = await fetch(feedUrl(board.kind, board.slug))
      if (!res.ok) {
        const error = `The feed answered ${res.status}`
        await ctx.runMutation(internal.api.jobs.boardFetched, {
          boardId,
          startedAt,
          jobs: 0,
          error,
        })
        // A board that's gone or never published a feed (some Personio companies don't)
        // won't change on a retry, so it's noted on the board and the fetch ends here.
        if (res.status >= 400 && res.status < 500) {
          log.set({ error })
          return null
        }
        throw new Error(error)
      }
      const jobs = parseFeed(
        board.kind,
        board.slug,
        board.kind === "personio" ? await res.text() : await res.json(),
        startedAt
      ).filter((j) => j.url.startsWith("https://") && j.title)
      for (let i = 0; i < jobs.length; i += 100)
        await ctx.runMutation(internal.api.jobs.saveJobs, {
          boardId,
          jobs: jobs.slice(i, i + 100),
          seenAt: startedAt,
        })
      await ctx.runMutation(internal.api.jobs.boardFetched, {
        boardId,
        startedAt,
        jobs: jobs.length,
        company: jobs[0]?.company,
      })
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
