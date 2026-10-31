// Mail written from an application. It goes out from the person's plain address, with replies
// aimed at the company's own address when that's on, so they come back to the right place
// however the other side's mail is set up. Cloudflare's send API returns no Message-ID, so a
// reply is matched by that address, or by the email it answers.
import { ConvexError, v } from "convex/values"
import { api, components, internal } from "../../_generated/api"
import type { Id } from "../../_generated/dataModel"
import { type ActionCtx, action, internalMutation, internalQuery } from "../../_generated/server"
import { arkToConvex, checked } from "../../lib/ark"
import { workLog } from "../../lib/log"
import { seal } from "../../lib/secrets"
import { keepLogFromAction, reasonOf } from "../activity/utils"
import { addressWithoutPlus, companyAddress } from "./addresses"
import { createRule, ruleFor } from "./cloudflare"
import { messageIdsIn } from "./match"
import { aad, cloudflare, limits, openConnection, openJson, outgoing, userIdOf } from "./utils"
import { Received, SendMail } from "./validators"

// What sending needs: the application's number, and the email being answered, sealed.
const sendContext = internalQuery({
  args: {
    userId: v.id("users"),
    applicationId: v.optional(v.id("applications")),
    replyTo: v.optional(v.id("mailEvents")),
  },
  returns: v.union(
    v.null(),
    v.object({
      company: v.optional(v.string()),
      parent: v.optional(v.string()),
    })
  ),
  handler: async (ctx, { userId, applicationId, replyTo }) => {
    const application = applicationId ? await ctx.db.get("applications", applicationId) : null
    if (applicationId && (application?.userId !== userId || application.trashedAt !== undefined))
      return null
    const event = replyTo && (await ctx.db.get("mailEvents", replyTo))
    const email =
      event && event.userId === userId
        ? await ctx.runQuery(components.cloudflareEmail.lib.get, { emailId: event.emailId })
        : null
    return {
      ...(application && { company: application.company }),
      ...(email && { parent: email.payload }),
    }
  },
})

// A line on the application's timeline. It's your own mail, so no line in Updates or workflow.
const recordSent = internalMutation({
  args: {
    userId: v.id("users"),
    applicationId: v.optional(v.id("applications")),
    emailId: v.string(),
    note: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, event) => {
    const id = await ctx.db.insert("mailEvents", {
      ...event,
      kind: "other",
      at: Date.now(),
      by: "sent",
      box: "sent",
    })
    await ctx.scheduler.runAfter(0, internal.contacts.learn, { eventId: id })
    return null
  },
})

const sendOne = async (
  ctx: ActionCtx,
  userId: Id<"users">,
  args: typeof SendMail.inferIn,
  log: ReturnType<typeof workLog>
) => {
  const { applicationId, to, subject, text, replyTo, html, draftId } = checked(SendMail, args)
  const { row, k, details, token } = await openConnection(ctx, userId)
  if (!row.allow.send) throw new ConvexError("Turn on “Send email” under Account first.")
  const context = await ctx.runQuery(internal.email.sendContext, {
    userId,
    ...(applicationId && { applicationId }),
    ...(replyTo && { replyTo }),
  })
  if (!context) throw new ConvexError("That application isn't here anymore.")
  log.set({ summary: context.company ? `Email to ${context.company}` : "Email" })
  const { ok } = await limits.limit(ctx, "sendMail", { key: userId })
  if (!ok) throw new ConvexError("That's 30 emails today. Try again tomorrow.")
  const parent = context.parent && (await openJson(k, context.parent, aad.email(userId), Received))
  const parentId = parent && messageIdsIn(parent.messageId)[0]
  const email = {
    from: details.fromAddress,
    to: [to],
    subject,
    text,
    ...(html && { html }),
    ...(context.company &&
      row.inbound &&
      row.allow.receive &&
      row.allow.tag && { replyTo: companyAddress(details.fromAddress, context.company) }),
    ...(parentId && {
      headers: {
        "In-Reply-To": parentId,
        // The newest few: the header has a size limit, and threading only needs those.
        References: [...messageIdsIn(parent.references).slice(-10), parentId].join(" "),
      },
    }),
  }
  const sealEmail = (value: object) => seal(k, JSON.stringify(value), aad.email(userId))
  const emailId = await ctx.runMutation(components.cloudflareEmail.lib.queue, {
    owner: userId,
    // `attachments` so the timeline reads it the same way as mail that came in.
    payload: await sealEmail({ ...email, attachments: [] }),
  })
  const { error } = await ctx.runAction(components.cloudflareEmail.lib.send, {
    accountId: details.accountId,
    apiToken: token,
    email: await outgoing(ctx, row, email),
  })
  await ctx.runMutation(components.cloudflareEmail.lib.markResult, {
    emailId,
    failed: error !== undefined,
    error: error && (await seal(k, error, aad.email(userId))),
  })
  if (error) throw new ConvexError(`Cloudflare didn't send it: ${error}`)
  await ctx.runMutation(internal.email.recordSent, {
    userId,
    ...(applicationId && { applicationId }),
    emailId,
    note: await seal(
      k,
      JSON.stringify({ from: details.fromAddress, to, subject }),
      aad.email(userId)
    ),
  })
  if (draftId) await ctx.runMutation(api.mailbox.deleteDraft, { id: draftId })
}

const sendFromApplication = action({
  args: arkToConvex(SendMail),
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await userIdOf(ctx)
    const log = workLog("mail.send", {
      userId,
      ...(args.applicationId && { applicationId: args.applicationId }),
    })
    log.set({ summary: "Sending an email" })
    try {
      await sendOne(ctx, userId, args, log)
      log.set({ outcome: "sent" })
    } catch (cause) {
      log.set({ outcome: "failed", error: reasonOf(cause) })
      log.setLevel("error")
      throw cause
    } finally {
      await keepLogFromAction(ctx, log)
    }
    return null
  },
})

// Most of a domain's 200 routing rules stay free for the person's own use.
const maxPlainAddresses = 150

// For a form that refuses a plus. Cloudflare can't match a pattern here, so each of these
// needs its own routing rule, which is why it's only made when asked for.
const makeAddressWithoutPlus = action({
  args: { applicationId: v.id("applications") },
  returns: v.string(),
  handler: async (ctx, { applicationId }) => {
    const userId = await userIdOf(ctx)
    const { row, details, token } = await openConnection(ctx, userId)
    if (!row.inbound || !row.allow.receive) throw new ConvexError("Set up incoming mail first.")
    if (!row.allow.setup || !details.zoneId)
      throw new ConvexError("Turn on “Set up Cloudflare for you” first.")
    const context = await ctx.runQuery(internal.email.sendContext, { userId, applicationId })
    if (!context?.company) throw new ConvexError("That application isn't here anymore.")
    const address = addressWithoutPlus(details.fromAddress, context.company)
    // Applications at one company share it.
    if (await ruleFor(details.zoneId, token, address)) return address
    if ((row.inbound.aliasRules?.length ?? 0) >= maxPlainAddresses)
      throw new ConvexError("That's as many of these as Cloudflare's rule limit leaves room for.")
    const { ok } = await limits.limit(ctx, "plainAddress", { key: userId })
    if (!ok) throw new ConvexError("Too many at once. Wait an hour and try again.")
    const ruleId = await createRule(details.zoneId, token, address, row.inbound.worker).catch(
      (cause: unknown) => {
        throw cloudflare(cause)
      }
    )
    await ctx.runMutation(internal.email.addAliasRule, { userId, ruleId })
    return address
  },
})

export const sendApi = { sendContext, recordSent, sendFromApplication, makeAddressWithoutPlus }
