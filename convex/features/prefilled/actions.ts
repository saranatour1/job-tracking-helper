import { getAuthUserId } from "@convex-dev/auth/server"
import { convexGateway } from "@convex-dev/ai-sdk-provider"
import { experimental_decide as decide, generateText } from "ai"
import type { FunctionReturnType } from "convex/server"
import { ConvexError, v } from "convex/values"
import { internal } from "../../_generated/api"
import { action, internalAction } from "../../_generated/server"
import { workLog } from "../../lib/log"
import { keepLogFromAction, reasonOf } from "../activity/utils"
import { jevModel } from "../workflows/judge"
import { OutOfCredits } from "../workflows/sources/source"
import { turn } from "../workflows/utils"
import { canDraft, draftModel, draftPrompt, draftsFrom, withDrafts } from "./draft"
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

const prepareForm = internalAction({
  args: { id: v.id("prefills") },
  returns: v.null(),
  handler: async (ctx, { id }): Promise<null> => {
    const found: FunctionReturnType<typeof internal.api.prefilled.plan> = await ctx.runQuery(
      internal.api.prefilled.plan,
      { id }
    )
    if (found?.status !== "preparing") return null
    const startedAt = Date.now()
    const log = workLog("prefill.prepare", { prefillId: id, userId: found.userId })
    log.set({ summary: `${found.title} · ${found.company}` })
    let scrapeId: string | undefined
    let credits = 0
    const stop = async (error: string) => {
      await ctx.runMutation(internal.api.prefilled.fail, { id, error, credits })
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

      const plan = planFor(fields, found.answers)
      let aiUnavailable = false as boolean
      const aiFailed = (cause: unknown) => {
        aiUnavailable = true
        log.set({ aiError: cause instanceof Error ? cause.message.slice(0, 200) : "unknown" })
      }
      let picks: Record<string, string | undefined> = {}
      if (plan.ask.length) {
        try {
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
        } catch (cause) {
          aiFailed(cause)
        }
      }
      let prepared = prefillFieldsFrom(fields, plan, resolve(plan.ask, found.answers, picks))

      const had = found.fields.filter((f) => f.answer && (f.source === "you" || f.source === "ai"))
      const questions = [
        ...new Set(
          prepared
            .filter((f) => canDraft(f) && !had.some((h) => h.question === f.question))
            .map((f) => f.question)
        ),
      ]
      if (!aiUnavailable && questions.length && (found.resumeText || found.answers.length)) {
        try {
          const result = await generateText({
            model: convexGateway(draftModel, { zdr: true }),
            prompt: draftPrompt({ ...found, questions }),
            maxOutputTokens: 300 * questions.length,
            // Thinking would cost a third more and eat this limit, and a cut-off reply parses to no drafts.
            providerOptions: { convexGateway: { reasoning: { enabled: false } } },
          })
          prepared = withDrafts(prepared, questions, draftsFrom(result.text, questions.length))
          log.set({ draftCost: Number(result.providerMetadata?.convexGateway?.cost ?? 0) })
        } catch (cause) {
          aiFailed(cause)
        }
      }
      await ctx.runMutation(internal.api.prefilled.savePrepared, {
        id,
        fields: prepared,
        credits,
        ...(aiUnavailable && { aiUnavailable }),
      })
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
      await keepLogFromAction(ctx, log)
    }
  },
})

const startLive = action({
  args: { id: v.id("prefills") },
  returns: v.null(),
  handler: async (ctx, { id }): Promise<null> => {
    const userId = await getAuthUserId(ctx)
    if (!userId) throw new Error("Not signed in")
    await ctx.runMutation(internal.api.prefilled.beginLive, { userId, id })
    const log = workLog("prefill.live", { prefillId: id, userId })
    let scrapeId: string | undefined
    let credits = 0
    try {
      const found: FunctionReturnType<typeof internal.api.prefilled.plan> = await ctx.runQuery(
        internal.api.prefilled.plan,
        { id }
      )
      if (found) log.set({ summary: `${found.title} · ${found.company}` })
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
      const { fills, unfilled, spots } = liveFillsFrom(fields, found.fields)
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
      await ctx.runMutation(internal.api.prefilled.goLive, {
        id,
        scrapeId,
        liveUrl: filled.liveUrl,
        unfilled: [
          ...(upload ? [] : ["Resume"]),
          ...unfilled,
          ...result.unfilled.map((u) => u.label),
        ],
        spots,
        credits,
      })
      log.set({ outcome: "live", credits, unfilled: result.unfilled.length + unfilled.length })
      return null
    } catch (cause) {
      log.error(cause as Error)
      log.set({ outcome: "failed", error: reasonOf(cause) })
      if (scrapeId) await endSession(scrapeId).catch(() => null)
      const message =
        cause instanceof ConvexError && typeof cause.data === "string"
          ? cause.data
          : problemOf(cause)
      await ctx.runMutation(internal.api.prefilled.endLive, { id, error: message, credits })
      throw new ConvexError(message)
    } finally {
      await keepLogFromAction(ctx, log)
    }
  },
})

const sendToForm = action({
  args: { id: v.id("prefills"), question: v.string() },
  returns: v.object({ filled: v.boolean() }),
  handler: async (ctx, { id, question }): Promise<{ filled: boolean }> => {
    const userId = await getAuthUserId(ctx)
    if (!userId) throw new Error("Not signed in")
    const found = await ctx.runQuery(internal.api.prefilled.session, { id })
    if (found?.userId !== userId) throw new ConvexError("That isn't yours.")
    if (found.status !== "live" || !found.scrapeId)
      throw new ConvexError("This browser has closed.")
    const field = found.fields.find((f) => f.question === question)
    if (!field?.selector)
      throw new ConvexError("We can't find that question in the form. Look for it there.")
    await turn(ctx, "firecrawl")
    const sent = await interact(
      found.scrapeId,
      fillScript({
        fills: field.answer
          ? [
              {
                selector: field.selector,
                value: field.answer,
                key: field.entryKey ?? "you",
                type: field.type,
                label: question,
                ...(field.fallback && { fallback: field.fallback }),
              },
            ]
          : [],
        consent: [],
        show: field.selector,
      }),
      60
    )
    const filled = field.answer ? FillResult.assert(sent.value).unfilled.length === 0 : undefined
    await ctx.runMutation(internal.api.prefilled.sent, {
      id,
      question,
      credits: 1,
      ...(filled !== undefined && { filled }),
    })
    return { filled: Boolean(filled) }
  },
})

const confirmSent = action({
  args: { id: v.id("prefills"), anyway: v.optional(v.boolean()) },
  returns: v.object({ sent: v.boolean() }),
  handler: async (ctx, { id, anyway }): Promise<{ sent: boolean }> => {
    const userId = await getAuthUserId(ctx)
    if (!userId) throw new Error("Not signed in")
    const found = await ctx.runQuery(internal.api.prefilled.session, { id })
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
    await ctx.runMutation(internal.api.prefilled.finish, { userId, id, confirmation, credits: 1 })
    await endSession(found.scrapeId).catch(() => null)
    return { sent: true }
  },
})

const cancelLive = action({
  args: { id: v.id("prefills") },
  returns: v.null(),
  handler: async (ctx, { id }): Promise<null> => {
    const userId = await getAuthUserId(ctx)
    if (!userId) throw new Error("Not signed in")
    const found = await ctx.runQuery(internal.api.prefilled.session, { id })
    if (found?.userId !== userId) throw new ConvexError("That isn't yours.")
    if (found.scrapeId) await endSession(found.scrapeId).catch(() => null)
    await ctx.runMutation(internal.api.prefilled.endLive, { id })
    return null
  },
})

const closeLive = internalAction({
  args: { id: v.id("prefills"), scrapeId: v.string() },
  returns: v.null(),
  handler: async (ctx, { id, scrapeId }): Promise<null> => {
    const found = await ctx.runQuery(internal.api.prefilled.session, { id })
    if (found?.status !== "live" || found.scrapeId !== scrapeId) return null
    await endSession(scrapeId).catch(() => null)
    await ctx.runMutation(internal.api.prefilled.endLive, {
      id,
      scrapeId,
      error: "The browser closed after 15 minutes. Nothing was sent unless you pressed Submit.",
    })
    return null
  },
})

export const actionsApi = {
  prepareForm,
  startLive,
  sendToForm,
  confirmSent,
  cancelLive,
  closeLive,
}
