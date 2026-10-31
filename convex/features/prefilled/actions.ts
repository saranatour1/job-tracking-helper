import { getAuthUserId } from "@convex-dev/auth/server"
import { convexGateway } from "@convex-dev/ai-sdk-provider"
import { experimental_decide as decide } from "ai"
import type { FunctionReturnType } from "convex/server"
import { ConvexError, v } from "convex/values"
import { internal } from "../../_generated/api"
import { action, internalAction } from "../../_generated/server"
import { workLog } from "../../lib/log"
import { jevModel } from "../workflows/judge"
import { OutOfCredits } from "../workflows/sources/source"
import { turn } from "../workflows/utils"
import {
  confirmScript,
  endSession,
  fillScript,
  interact,
  readFormScript,
  scrape,
} from "./firecrawl"
import {
  type FormField,
  liveFillsFrom,
  planFor,
  prefillFieldsFrom,
  questionsFor,
  resolve,
} from "./match"
import { sureEnough } from "./utils"
import { ConfirmResult, FillResult, ReadResult } from "./validators"

const fieldsOf = (fields: NonNullable<typeof ReadResult.infer.fields>): FormField[] =>
  fields.map((f) => ({ ...f, ...(f.options?.length && { options: f.options }) }))

const problemOf = (cause: unknown) =>
  cause instanceof OutOfCredits
    ? "Firecrawl is out of credits this month."
    : `Something went wrong: ${cause instanceof Error ? cause.message.slice(0, 200) : "unknown"}`

/** Reads a posting's form and answers what it can from your saved answers, with no one
 * there. The browser closes at the end, and nothing is typed into the form. */
const prepareForm = internalAction({
  args: { id: v.id("prefills") },
  returns: v.null(),
  handler: async (ctx, { id }): Promise<null> => {
    const found: FunctionReturnType<typeof internal.prefilled.plan> = await ctx.runQuery(
      internal.prefilled.plan,
      { id }
    )
    if (found?.status !== "preparing") return null
    const startedAt = Date.now()
    const log = workLog("prefill.prepare", { prefillId: id, userId: found.userId })
    let scrapeId: string | undefined
    let credits = 0
    const stop = async (error: string) => {
      await ctx.runMutation(internal.prefilled.fail, { id, error, credits })
      log.set({ outcome: "failed", credits, runMs: Date.now() - startedAt, error })
      return null
    }
    try {
      await turn(ctx, "firecrawl")
      const opened = await scrape(found.url)
      scrapeId = opened.scrapeId
      credits += 1
      await turn(ctx, "firecrawl")
      const read = ReadResult.assert((await interact(scrapeId, readFormScript(), 120)).value)
      credits += 1
      if (read.login) return await stop("This form wants you to sign in first.")
      if (read.captcha) return await stop("This form showed a CAPTCHA while reading it. Try again.")
      if (!read.fields?.length) return await stop("We couldn't find the application form.")
      const fields = fieldsOf(read.fields)

      // Synonyms first, then Jev picks among saved answers for the rest.
      const plan = planFor(fields, found.answers)
      let picks: Record<string, string | undefined> = {}
      if (plan.ask.length) {
        const result = await decide({
          model: convexGateway.evaluationModel(jevModel),
          state: {
            answers: found.answers.map((a) => ({ key: a.key, label: a.label, value: a.value })),
            form: plan.ask.map((f) => ({
              label: f.label,
              required: f.required,
              options: f.options,
            })),
          },
          questions: questionsFor(plan.ask, found.answers),
        })
        const answers = result.answers as Record<
          string,
          { choice?: string; probabilities?: Record<string, number> } | undefined
        >
        picks = Object.fromEntries(
          Object.entries(answers).map(([q, a]) => [
            q,
            a?.choice && a.choice !== "none" && (a.probabilities?.[a.choice] ?? 0) >= sureEnough
              ? a.choice
              : undefined,
          ])
        )
      }
      const prepared = prefillFieldsFrom(fields, plan, resolve(plan.ask, found.answers, picks))
      await ctx.runMutation(internal.prefilled.savePrepared, { id, fields: prepared, credits })
      // Only the questions' count and labels: answers' values never go in the log.
      log.set({
        outcome: "prepared",
        credits,
        runMs: Date.now() - startedAt,
        asked: prepared.length,
      })
      return null
    } catch (cause) {
      log.error(cause as Error)
      await stop(problemOf(cause)).catch(() => null)
      return null
    } finally {
      if (scrapeId) await endSession(scrapeId).catch(() => null)
      log.emit()
    }
  },
})

/** Apply now: opens the form, fills it and uploads the resume, then leaves the browser open
 * for you to check and press Submit. The app never presses it. */
const startLive = action({
  args: { id: v.id("prefills") },
  returns: v.null(),
  handler: async (ctx, { id }): Promise<null> => {
    const userId = await getAuthUserId(ctx)
    if (!userId) throw new Error("Not signed in")
    await ctx.runMutation(internal.prefilled.beginLive, { userId, id })
    const log = workLog("prefill.live", { prefillId: id, userId })
    let scrapeId: string | undefined
    let credits = 0
    try {
      const found: FunctionReturnType<typeof internal.prefilled.plan> = await ctx.runQuery(
        internal.prefilled.plan,
        { id }
      )
      if (!found?.resume) throw new ConvexError("Upload a resume on the Resume page first.")
      const resumeUrl = await ctx.storage.getUrl(found.resume.id)
      if (!resumeUrl) throw new ConvexError("The resume file is gone. Upload it again.")
      await turn(ctx, "firecrawl")
      scrapeId = (await scrape(found.url)).scrapeId
      credits += 1
      await turn(ctx, "firecrawl")
      const read = ReadResult.assert((await interact(scrapeId, readFormScript(), 120)).value)
      credits += 1
      if (!read.fields?.length) throw new ConvexError("We couldn't find the application form.")
      // The form as it reads now: selectors don't last between browsers.
      const fields = fieldsOf(read.fields)
      const { upload, consent } = planFor(fields, [])
      const { fills, unfilled } = liveFillsFrom(fields, found.fields)
      await turn(ctx, "firecrawl")
      const filled = await interact(
        scrapeId,
        fillScript({
          fills,
          consent,
          ...(upload && { resume: { url: resumeUrl, selector: upload, ...found.resume } }),
        }),
        180
      )
      credits += 1
      const result = FillResult.assert(filled.value)
      if (!filled.liveUrl.startsWith("https://"))
        throw new ConvexError("Firecrawl didn't give us a browser to show you.")
      await ctx.runMutation(internal.prefilled.goLive, {
        id,
        scrapeId,
        liveUrl: filled.liveUrl,
        unfilled: [
          ...(upload ? [] : ["Resume"]),
          ...unfilled,
          ...result.unfilled.map((u) => u.label),
        ],
        credits,
      })
      log.set({ outcome: "live", credits, unfilled: result.unfilled.length + unfilled.length })
      return null
    } catch (cause) {
      log.error(cause as Error)
      if (scrapeId) await endSession(scrapeId).catch(() => null)
      const message =
        cause instanceof ConvexError && typeof cause.data === "string"
          ? cause.data
          : problemOf(cause)
      await ctx.runMutation(internal.prefilled.endLive, { id, error: message, credits })
      throw new ConvexError(message)
    } finally {
      log.emit()
    }
  },
})

/** You say you've sent it. Looks for the form's thank-you. `anyway` is you saying it went
 * through even though we can't see one. */
const confirmSent = action({
  args: { id: v.id("prefills"), anyway: v.optional(v.boolean()) },
  returns: v.object({ sent: v.boolean() }),
  handler: async (ctx, { id, anyway }): Promise<{ sent: boolean }> => {
    const userId = await getAuthUserId(ctx)
    if (!userId) throw new Error("Not signed in")
    const found = await ctx.runQuery(internal.prefilled.session, { id })
    if (found?.userId !== userId) throw new ConvexError("That isn't yours.")
    if (found.status === "applied") return { sent: true }
    if (found.status !== "live" || !found.scrapeId)
      throw new ConvexError("This browser has closed.")
    let confirmation = "You said it was sent. The page showed no thank-you we could read."
    if (!anyway) {
      const seen = await interact(found.scrapeId, confirmScript(), 30).then(
        (r) => ConfirmResult.assert(r.value),
        () => null
      )
      if (!seen?.confirmed) return { sent: false }
      confirmation = seen.text
    }
    await ctx.runMutation(internal.prefilled.finish, { userId, id, confirmation, credits: 1 })
    await endSession(found.scrapeId).catch(() => null)
    return { sent: true }
  },
})

/** You closed it without sending. */
const cancelLive = action({
  args: { id: v.id("prefills") },
  returns: v.null(),
  handler: async (ctx, { id }): Promise<null> => {
    const userId = await getAuthUserId(ctx)
    if (!userId) throw new Error("Not signed in")
    const found = await ctx.runQuery(internal.prefilled.session, { id })
    if (found?.userId !== userId) throw new ConvexError("That isn't yours.")
    if (found.scrapeId) await endSession(found.scrapeId).catch(() => null)
    await ctx.runMutation(internal.prefilled.endLive, { id })
    return null
  },
})

/** Scheduled when a browser opens, so one left alone stops costing credits. */
const closeLive = internalAction({
  args: { id: v.id("prefills"), scrapeId: v.string() },
  returns: v.null(),
  handler: async (ctx, { id, scrapeId }): Promise<null> => {
    const found = await ctx.runQuery(internal.prefilled.session, { id })
    if (found?.status !== "live" || found.scrapeId !== scrapeId) return null
    await endSession(scrapeId).catch(() => null)
    await ctx.runMutation(internal.prefilled.endLive, {
      id,
      scrapeId,
      error: "The browser closed after 15 minutes. Nothing was sent unless you pressed Submit.",
    })
    return null
  },
})

export const actionsApi = { prepareForm, startLive, confirmSent, cancelLive, closeLive }
