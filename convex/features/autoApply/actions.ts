import { convexGateway } from "@convex-dev/ai-sdk-provider"
import { experimental_decide as decide } from "ai"
import { v } from "convex/values"
import { internal } from "../../_generated/api"
import { internalAction } from "../../_generated/server"
import { workLog } from "../../lib/log"
import { jevModel } from "../workflows/judge"
import { limits } from "../workflows/manager"
import { OutOfCredits } from "../workflows/sources/source"
import {
  endSession,
  FillResult,
  fillScript,
  interact,
  ReadResult,
  readFormScript,
  scrape,
  SubmitResult,
  submitScript,
} from "./firecrawl"
import { type FormField, planFor, questionsFor, resolve } from "./match"
import type { MissingQuestion, UsedAnswer } from "./models"

type Used = typeof UsedAnswer.infer
type Missing = typeof MissingQuestion.infer

// Jev's pick counts only when it's sure; a weak pick is treated as none.
const sureEnough = 0.6
// The run stops short of the submit click when less than this is left of the action.
const actionMs = 10 * 60 * 1000
const submitNeedsMs = 90 * 1000

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// Waits for a turn under the shared Firecrawl limit, like loops do.
const turn = async (ctx: Parameters<typeof limits.limit>[0]) => {
  const { retryAfter } = await limits.limit(ctx, "firecrawl", { reserve: true })
  if (retryAfter) await sleep(retryAfter)
}

/** One auto-apply run: open the form, match its fields to saved answers, fill it,
 * submit, and record how it went. Every stop writes the row; nothing is retried. */
const run = internalAction({
  args: { autoApplyId: v.id("autoApplies") },
  returns: v.null(),
  handler: async (ctx, { autoApplyId }) => {
    if (!(await ctx.runMutation(internal.autoApply.claim, { autoApplyId }))) return null
    const found = await ctx.runQuery(internal.autoApply.plan, { autoApplyId })
    const startedAt = Date.now()
    const log = workLog("autoApply.run", { autoApplyId, userId: found?.userId })
    let scrapeId: string | undefined
    let credits = 0
    const stop = async (
      status: "needsYou" | "previewed" | "applied" | "failed",
      more: { used?: Used[]; missing?: Missing[]; confirmation?: string; error?: string } = {}
    ) => {
      await ctx.runMutation(internal.autoApply.finish, { autoApplyId, status, credits, ...more })
      log.set({ outcome: status, credits, runMs: Date.now() - startedAt, ...more })
      return null
    }
    try {
      if (!found) return stop("failed", { error: "The row is gone." })
      if (!found.resume) return stop("failed", { error: "Upload a resume first." })

      // Open the posting and read its form.
      await turn(ctx)
      const opened = await scrape(found.url)
      scrapeId = opened.scrapeId
      credits += 1
      await turn(ctx)
      const read = ReadResult.assert(await interact(scrapeId, readFormScript(), 60))
      credits += 1
      if (read.login) return stop("needsYou", { error: "This form wants you to sign in first." })
      if (read.captcha) return stop("needsYou", { error: "This form has a CAPTCHA." })
      if (!read.fields?.length)
        return stop("failed", { error: "We couldn't find the application form." })
      const fields: FormField[] = read.fields.map((f) => ({
        ...f,
        ...(f.options?.length && { options: f.options }),
      }))

      // Match: synonyms first, then Jev picks among saved answers for the rest.
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
      const resolved = resolve(plan.ask, found.answers, picks)
      const fills = [...plan.fills, ...resolved.fills].map((f) => ({
        ...f,
        type: fields.find((x) => x.selector === f.selector)?.type ?? "text",
      }))
      const byKey = new Map(found.answers.map((a) => [a.key, a.label]))
      const used: Used[] = [...new Set(fills.map((f) => f.key))]
        .filter((key) => byKey.has(key))
        .map((key) => ({ key, label: byKey.get(key)! }))
      const missing = resolved.missing
      if (missing.some((m) => m.required))
        return stop("needsYou", {
          used,
          missing,
          error: `${missing.filter((m) => m.required).length} required questions have no saved answer.`,
        })
      if (!plan.upload)
        return stop("needsYou", {
          used,
          missing,
          error: "The form has no resume field we could find.",
        })

      // Fill.
      const resumeUrl = await ctx.storage.getUrl(found.resume.id)
      if (!resumeUrl)
        return stop("failed", { used, error: "The resume file is gone. Upload it again." })
      await turn(ctx)
      const filled = FillResult.assert(
        await interact(
          scrapeId,
          fillScript({
            fills,
            consent: plan.consent,
            resume: { url: resumeUrl, selector: plan.upload, ...found.resume },
          }),
          120
        )
      )
      credits += 1
      if (filled.unfilled.length || filled.errors.length)
        return stop("needsYou", {
          used,
          missing: [
            ...missing,
            ...filled.unfilled.map((u) => ({ question: u.label, required: true })),
          ],
          error: filled.errors[0]?.slice(0, 200) ?? "Some fields wouldn't take the answer.",
        })
      if (found.dryRun)
        return stop("previewed", { used, missing, confirmation: "Dry run: filled, nothing sent." })
      if (Date.now() - startedAt > actionMs - submitNeedsMs)
        return stop("needsYou", {
          used,
          missing,
          error: "Ran out of time before sending. Try again.",
        })

      // Submit, behind the fence.
      if (!(await ctx.runMutation(internal.autoApply.markSubmitting, { autoApplyId })))
        return stop("failed", { used, error: "Already sent once." })
      await turn(ctx)
      const sent = SubmitResult.assert(await interact(scrapeId, submitScript(read.submit), 90))
      credits += 1
      switch (sent.outcome) {
        case "confirmed":
          return stop("applied", { used, missing, confirmation: sent.text || sent.url })
        case "errors":
          return stop("needsYou", {
            used,
            missing,
            error: `The form said: ${sent.text.slice(0, 200)}`,
          })
        case "captcha":
          return stop("needsYou", {
            used,
            missing,
            error: `A CAPTCHA appeared on submit. Finish it yourself at ${sent.url}`,
          })
        default:
          return stop("failed", {
            used,
            missing,
            error:
              "We pressed Submit but saw no confirmation. Check your email before applying again.",
          })
      }
    } catch (cause) {
      log.error(cause as Error)
      await stop("failed", {
        error:
          cause instanceof OutOfCredits
            ? "Firecrawl is out of credits this month."
            : `Something went wrong: ${cause instanceof Error ? cause.message.slice(0, 200) : "unknown"}`,
      }).catch(() => null)
      return null
    } finally {
      if (scrapeId) await endSession(scrapeId).catch(() => null)
      log.emit()
    }
  },
})

export const actionsApi = { run }
