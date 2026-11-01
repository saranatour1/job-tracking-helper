import { convexGateway } from "@convex-dev/ai-sdk-provider"
import { experimental_decide as decide } from "ai"
import { ConvexError, v } from "convex/values"
import { components, internal } from "../../_generated/api"
import type { Id } from "../../_generated/dataModel"
import { action, internalAction } from "../../_generated/server"
import { memberId } from "../../lib/functions"
import { seal } from "../../lib/secrets"
import { companyAddress } from "../email/addresses"
import { openConnection, aad, outgoing } from "../email/utils"
import { jevModel } from "../workflows/judge"
import { limits as rates } from "../workflows/manager"
import { type DescribeAnswers, describeQuestions, draftFrom } from "./describe"
import { type Draft, vDraft } from "./validators"

const askJev = internalAction({
  args: { runId: v.id("automationRuns"), at: v.string() },
  returns: v.object({ path: v.union(v.number(), v.null()), error: v.optional(v.string()) }),
  handler: async (ctx, { runId, at }): Promise<{ path: number | null; error?: string }> => {
    const asked: { question: string; answers: string[]; facts: Record<string, string> } | null =
      await ctx.runQuery(internal.api.automations.decisionOf, { runId, at })
    if (!asked) return { path: null, error: "The run stopped." }
    try {
      const criteria = Object.fromEntries(asked.answers.map((answer, i) => [`p${i}`, answer]))
      const ask = () =>
        decide({
          model: convexGateway.evaluationModel(jevModel),
          state: asked.facts,
          questions: { answer: { type: "choice", instructions: asked.question, criteria } },
        })
      const result = await ask().catch(async () => {
        await new Promise((resolve) => setTimeout(resolve, 1000))
        return ask()
      })
      const choice = (result.answers as Record<string, { choice?: string } | undefined>).answer
        ?.choice
      const path = choice?.startsWith("p") ? Number(choice.slice(1)) : -1
      if (!(path >= 0 && path < asked.answers.length)) throw new Error("it picked none")
      await ctx.runMutation(internal.api.automations.answered, {
        runId,
        at,
        choice: asked.answers[path],
      })
      return { path }
    } catch (cause) {
      const error = `Jev couldn't answer: ${cause instanceof Error ? cause.message : "unknown"}`
      await ctx.runMutation(internal.api.automations.answered, {
        runId,
        at,
        error: error.slice(0, 300),
      })
      return { path: null, error: error.slice(0, 300) }
    }
  },
})

const sendMail = internalAction({
  args: { runId: v.id("automationRuns"), at: v.string() },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, { runId, at }): Promise<string | null> => {
    const mail: {
      userId: Id<"users">
      to?: string
      subject: string
      text: string
      application?: { id: Id<"applications">; company: string }
    } | null = await ctx.runQuery(internal.api.automations.emailOf, { runId, at })
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
        ...(mail.application &&
          row.inbound &&
          row.allow.receive &&
          row.allow.tag && {
            replyTo: companyAddress(details.fromAddress, mail.application.company),
          }),
      }
      const sealEmail = (value: object) => seal(k, JSON.stringify(value), aad.email(mail.userId))
      const emailId = await ctx.runMutation(components.cloudflareEmail.lib.queue, {
        owner: mail.userId,
        payload: await sealEmail({ ...email, attachments: [] }),
      })
      const { messageId, error } = await ctx.runAction(components.cloudflareEmail.lib.send, {
        accountId: details.accountId,
        apiToken,
        email: await outgoing(ctx, row, email, { sign: mail.to !== undefined }),
      })
      await ctx.runMutation(components.cloudflareEmail.lib.markResult, {
        emailId,
        failed: error !== undefined,
        payload: messageId ? await sealEmail({ ...email, attachments: [], messageId }) : undefined,
        error: error && (await seal(k, error, aad.email(mail.userId))),
      })
      if (error) throw new ConvexError("Cloudflare didn't send the email.")
      if (mail.to)
        await ctx.runMutation(internal.api.email.recordSent, {
          userId: mail.userId,
          ...(mail.application && { applicationId: mail.application.id }),
          emailId,
          note: await seal(
            k,
            JSON.stringify({ from: details.fromAddress, to: email.to[0], subject: mail.subject }),
            aad.email(mail.userId)
          ),
        })
      await ctx.runMutation(internal.api.automations.emailed, { runId, at })
      return null
    } catch (cause) {
      const error =
        cause instanceof ConvexError ? String(cause.data) : "The email couldn't be sent."
      await ctx.runMutation(internal.api.automations.emailed, { runId, at, error })
      return error
    }
  },
})

const describe = action({
  args: { request: v.string(), zone: v.string() },
  returns: vDraft,
  handler: async (ctx, { request, zone }): Promise<Draft> => {
    const userId = await memberId(ctx)
    if (!userId) throw new Error("Not signed in")
    const said = request.trim()
    if (said.length < 5 || said.length > 300)
      throw new ConvexError("Say what it should do in 5 to 300 characters.")
    const { ok } = await rates.limit(ctx, "automationDescribe", { key: userId })
    if (!ok) throw new ConvexError("That's 20 drafts today. Build this one from blocks.")
    const result = await decide({
      model: convexGateway.evaluationModel(jevModel),
      state: { request: said },
      questions: describeQuestions,
    }).catch(() => {
      throw new ConvexError("Jev couldn't read that just now. Try again, or build it from blocks.")
    })
    const answers = Object.fromEntries(
      Object.entries(
        result.answers as Record<string, { type: string; choice?: string; probability?: number }>
      )
        .filter(([, a]) => a.type === "choice" || a.type === "boolean")
        .map(([key, a]) => [key, a.type === "choice" ? a.choice : (a.probability ?? 0) >= 0.5])
    ) as DescribeAnswers
    const loopId: Id<"loops"> | null = await ctx.runQuery(internal.api.automations.firstLoopOf, {
      userId,
    })
    return draftFrom(answers, { request: said, zone, ...(loopId && { loopId }) })
  },
})

export const actionsApi = { askJev, sendMail, describe }
