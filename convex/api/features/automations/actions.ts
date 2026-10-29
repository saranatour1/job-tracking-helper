import { convexGateway } from "@convex-dev/ai-sdk-provider"
import { experimental_decide as decide } from "ai"
import { ConvexError, v } from "convex/values"
import { components, internal } from "../../../_generated/api"
import type { Id } from "../../../_generated/dataModel"
import { internalAction } from "../../../_generated/server"
import { seal } from "../../../lib/secrets"
import { openConnection } from "../email/inbound"
import { aad } from "../email/internal"
import { jevModel } from "../workflows/judge"

// The steps that call out: Jev for Ask Jev, and Cloudflare for Notify me by email. Each
// records how it went before returning, so a run's history says why it stopped.

/** Asks Jev the step's question about what the run knows; returns the path to take. */
const askJev = internalAction({
  args: { runId: v.id("automationRuns"), at: v.string() },
  returns: v.object({ path: v.union(v.number(), v.null()), error: v.optional(v.string()) }),
  handler: async (ctx, { runId, at }): Promise<{ path: number | null; error?: string }> => {
    const asked: { question: string; answers: string[]; facts: Record<string, string> } | null =
      await ctx.runQuery(internal.automations.decisionOf, { runId, at })
    if (!asked) return { path: null, error: "The run stopped." }
    try {
      const criteria = Object.fromEntries(asked.answers.map((answer, i) => [`p${i}`, answer]))
      const result = await decide({
        model: convexGateway.evaluationModel(jevModel),
        state: asked.facts,
        questions: { answer: { type: "choice", instructions: asked.question, criteria } },
      })
      const choice = (result.answers as Record<string, { choice?: string } | undefined>).answer
        ?.choice
      const path = choice?.startsWith("p") ? Number(choice.slice(1)) : -1
      if (!(path >= 0 && path < asked.answers.length)) throw new Error("it picked none")
      await ctx.runMutation(internal.automations.answered, {
        runId,
        at,
        choice: asked.answers[path],
      })
      return { path }
    } catch (cause) {
      const error = `Jev couldn't answer: ${cause instanceof Error ? cause.message : "unknown"}`
      await ctx.runMutation(internal.automations.answered, {
        runId,
        at,
        error: error.slice(0, 300),
      })
      return { path: null, error: error.slice(0, 300) }
    }
  },
})

/**
 * Sends an email step from the person's own Cloudflare connection, the way the test email
 * goes: Notify me to themselves, Send email to whoever it names. Returns why it couldn't,
 * or null.
 */
const sendMail = internalAction({
  args: { runId: v.id("automationRuns"), at: v.string() },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, { runId, at }): Promise<string | null> => {
    const mail: { userId: Id<"users">; to?: string; subject: string; text: string } | null =
      await ctx.runQuery(internal.automations.emailOf, { runId, at })
    if (!mail) return null
    try {
      const { row, k, details, token: apiToken } = await openConnection(ctx, mail.userId)
      if (!row.allow.send)
        throw new ConvexError("Turn on “Send email” under Account to let workflows send email.")
      const email = {
        from: details.fromAddress,
        to: [mail.to ?? (row.userEmail || details.fromAddress)],
        subject: mail.subject,
        text: mail.text,
      }
      const sealEmail = (value: object) => seal(k, JSON.stringify(value), aad.email(mail.userId))
      const emailId = await ctx.runMutation(components.cloudflareEmail.lib.queue, {
        owner: mail.userId,
        payload: await sealEmail(email),
      })
      const { messageId, error } = await ctx.runAction(components.cloudflareEmail.lib.send, {
        accountId: details.accountId,
        apiToken,
        email,
      })
      await ctx.runMutation(components.cloudflareEmail.lib.markResult, {
        emailId,
        failed: error !== undefined,
        payload: messageId ? await sealEmail({ ...email, messageId }) : undefined,
        error: error && (await seal(k, error, aad.email(mail.userId))),
      })
      if (error) throw new ConvexError("Cloudflare didn't send the email.")
      await ctx.runMutation(internal.automations.emailed, { runId, at })
      return null
    } catch (cause) {
      const error =
        cause instanceof ConvexError ? String(cause.data) : "The email couldn't be sent."
      await ctx.runMutation(internal.automations.emailed, { runId, at, error })
      return error
    }
  },
})

export const actionsApi = { askJev, sendMail }
