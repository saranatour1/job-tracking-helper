import { v } from "convex/values"
import { internal } from "../../_generated/api"
import type { Id } from "../../_generated/dataModel"
import { type ActionCtx, internalAction } from "../../_generated/server"
import { workLog } from "../../lib/log"
import { seal } from "../../lib/secrets"
import { keepLogFromAction, reasonOf } from "../activity/utils"
import { tagIn } from "./addresses"
import { askJev } from "./jev"
import {
  type Candidate,
  kindOf,
  messageIdsIn,
  portalOf,
  ruleMatch,
  slotOf,
  suggestionOf,
  tagMatch,
  zoneOf,
} from "./match"
import { aad, openJson, secretKeys, threadKeyOf } from "./utils"
import { Received } from "./validators"

const sortOne = async (
  ctx: ActionCtx,
  { userId, emailId }: { userId: Id<"users">; emailId: string }
) => {
  const context = await ctx.runQuery(internal.api.email.sortContext, { userId, emailId })
  if (!context) return
  const k = await secretKeys()
  const mail = await openJson(k, context.payload, aad.email(userId), Received)
  if (!mail) throw new Error("It couldn't be opened with the current key.")
  const text = mail.text ?? ""
  const tag = tagIn(mail.to)
  const tagged = tag ? tagMatch(tag, mail.subject, context.applications) : undefined
  const parents = await Promise.all(
    [...messageIdsIn(mail.references), ...messageIdsIn(mail.inReplyTo)].map((id) =>
      threadKeyOf(userId, id)
    )
  )
  const threadApp = parents.length
    ? await ctx.runQuery(internal.api.email.threadOf, { userId, keys: parents })
    : null
  const inThread = context.applications.find((a) => a.id === threadApp)
  const known = tagged ?? inThread
  let application: Candidate | undefined = known ?? ruleMatch(mail, context.applications)
  let kind = kindOf(mail.subject, text)
  // Typed this way so TypeScript doesn't narrow it to "rules": Jev sets it in a callback.
  let by = "rules" as "rules" | "jev"
  let sureOfKind = 0
  if (context.read && context.applications.length)
    await askJev(mail, context.applications).then(
      (answer) => {
        ;({ kind, sureOfKind } = answer)
        if (!known) application = answer.application ?? application
        by = "jev"
      },
      () => null
    )
  const chosen = tagged ?? context.applications.find((a) => a.id === application?.id)
  const portalUrl = portalOf(kind, text, mail.html)
  await ctx.runMutation(internal.api.email.record, {
    event: {
      userId,
      emailId,
      applicationId: chosen?.id,
      kind,
      at: Date.now(),
      note: await seal(
        k,
        JSON.stringify({
          from: mail.fromName || mail.from,
          subject: mail.subject,
          portalUrl,
          ...(kind === "interview" && {
            slot: slotOf(`${mail.subject}\n${text}`, Date.now()),
            slotZone: zoneOf(`${mail.subject}\n${text}`),
          }),
        }),
        aad.email(userId)
      ),
      suggest: chosen && suggestionOf(kind, chosen.status),
      ...(mail.messageId && { messageKey: await threadKeyOf(userId, mail.messageId) }),
      by: by === "rules" ? (tagged ? "tag" : inThread ? "thread" : by) : by,
    },
    move: context.move && by === "jev" && sureOfKind >= 0.8,
  })
}

// Scheduled with only ids, so no message is ever kept in a scheduled call.
const sortMail = internalAction({
  args: { userId: v.id("users"), emailId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await sortOne(ctx, args).catch(async (cause: unknown) => {
      const log = workLog("mail.received", { userId: args.userId })
      log.set({ summary: "An email couldn't be sorted", outcome: "failed", error: reasonOf(cause) })
      log.setLevel("error")
      await keepLogFromAction(ctx, log)
      throw cause
    })
    return null
  },
})

export const sortActions = { sortMail }
