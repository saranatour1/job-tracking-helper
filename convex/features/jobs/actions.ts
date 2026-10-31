import { isNonRetryableError } from "@convex-dev/workpool"
import { v } from "convex/values"
import { internal } from "../../_generated/api"
import { internalAction } from "../../_generated/server"
import { workLog } from "../../lib/log"
import { limits } from "../workflows/manager"
import { apiKeyOf } from "../workflows/sources"
import { webSearch } from "../workflows/sources/firecrawl"
import { OutOfCredits } from "../workflows/sources/source"
import { feedUrl, parseFeed } from "./boards"
import {
  postingDomain,
  rdapRegistries,
  rdapRegistriesUrl,
  registeredAtOf,
  researchBatch,
  searchedDomain,
  ycByDomain,
  ycUrl,
} from "./companies"

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

// An age is never worth failing a company over.
const readJson = async (url: string) => {
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) }).catch(() => null)
  return res?.ok ? await res.json().catch(() => null) : null
}

// One read of the YC list per batch, since it's 10 MB. A search that may work later fails the
// batch and leaves the rest due, so a bad minute doesn't mark a real company unverified for a month.
const researchBoards = internalAction({
  args: { boardIds: v.array(v.id("jobBoards")) },
  returns: v.null(),
  handler: async (ctx, { boardIds }) => {
    const log = workLog("jobs.researchBoards", { boards: boardIds.length })
    try {
      const res = await fetch(ycUrl, { signal: AbortSignal.timeout(60_000) })
      if (!res.ok) throw new Error(`The YC list answered ${res.status}`)
      const yc = ycByDomain(await res.json())
      const registries = rdapRegistries(await readJson(rdapRegistriesUrl))
      const { boards, canSearch } = await ctx.runQuery(internal.api.jobs.researchInputs, {
        boardIds,
      })
      let searching = canSearch
      for (const board of boards) {
        const posted = postingDomain(board.urls)
        let credits = 0
        let exhausted = false
        let named = board.link === "name" ? board.domain : null
        if (!posted && !named && searching) {
          try {
            const { retryAfter } = await limits.limit(ctx, "companySearch", { reserve: true })
            if (retryAfter) await new Promise((resolve) => setTimeout(resolve, retryAfter))
            const found = await webSearch(
              apiKeyOf("firecrawl") ?? "",
              `${board.company} official website`,
              5
            )
            credits = found.credits
            named = searchedDomain(
              board.company,
              found.postings.map((p) => p.url)
            )
          } catch (error) {
            if (error instanceof OutOfCredits) {
              exhausted = true
              searching = false
            } else if (!isNonRetryableError(error)) throw error
            log.set({ searchError: (error as Error).message })
          }
        }
        const domain = posted ?? named ?? undefined
        const registry = domain && registries.get(domain.split(".").at(-1) ?? "")
        const age = registry ? registeredAtOf(await readJson(`${registry}domain/${domain}`)) : null
        await ctx.runMutation(internal.api.jobs.saveResearch, {
          boardId: board.boardId,
          domain,
          link: posted ? "postings" : named ? "name" : undefined,
          yc: domain ? yc.get(domain) : undefined,
          registeredAt: age ?? undefined,
          credits,
          exhausted,
        })
      }
      // A full batch likely left more, so a backfill doesn't wait for the hourly run. Every saved
      // board stops being due, so this ends.
      if (boardIds.length === researchBatch)
        await ctx.scheduler.runAfter(0, internal.api.jobs.researchDue, {})
      return null
    } catch (error) {
      log.error(error as Error)
      throw error
    } finally {
      log.emit()
    }
  },
})

export const actionsApi = { fetchBoard, researchBoards }
