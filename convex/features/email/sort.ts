import { paginationOptsValidator, paginationResultValidator } from "convex/server"
import type { PaginationOptions } from "convex/server"
import { ConvexError, v } from "convex/values"
import type { CustomCtx } from "convex-helpers/server/customFunctions"
import { components, internal } from "../../_generated/api"
import {
  type ActionCtx,
  internalAction,
  internalMutation,
  internalQuery,
} from "../../_generated/server"
import { workLog } from "../../lib/log"
import { authedMutation, authedQuery } from "../../lib/functions"
import { seal } from "../../lib/secrets"
import type { Doc, Id } from "../../_generated/dataModel"
import { changeStatus } from "../applications/utils"
import { boardOf } from "../jobs/boards"
import { fireEvent } from "../automations/fire"
import { mailNotificationKind } from "../notifications/kinds"
import { tagIn } from "./addresses"
import {
  secretKeys,
  aad,
  keys,
  linesOf,
  openJson,
  syncMailSummary,
  threadKeyOf,
  ownEvent,
} from "./utils"
import { askJev } from "./jev"
import {
  type Candidate,
  kindOf,
  messageIdsIn,
  portalOf,
  slotOf,
  zoneOf,
  textOfHtml,
  ruleMatch,
  suggestionOf,
  tagMatch,
} from "./match"
import {
  maxUnsortedCount,
  Received,
  vMailLine,
  vSortContext,
  vRecordArgs,
  vTimeline,
  vMailBody,
} from "./validators"
import { keepLog, keepLogFromAction, logEdit, reasonOf } from "../activity/utils"

const threadOf = internalQuery({
  args: { userId: v.id("users"), keys: v.array(v.string()) },
  returns: v.union(v.id("applications"), v.null()),
  handler: async (ctx, { userId, keys }) => {
    for (const key of keys.slice(-20).reverse()) {
      const earlier = await ctx.db
        .query("mailEvents")
        .withIndex("by_userId_and_messageKey", (q) => q.eq("userId", userId).eq("messageKey", key))
        .first()
      if (earlier?.applicationId) return earlier.applicationId
    }
    return null
  },
})

const candidateOf = (a: Doc<"applications">) => {
  const alias = a.url && boardOf(a.url)?.slug
  return {
    id: a._id,
    company: a.company,
    role: a.role,
    status: a.status,
    at: a._creationTime,
    ...(alias && { alias }),
  }
}

const knownMessage = internalQuery({
  args: { userId: v.id("users"), messageKey: v.string() },
  returns: v.boolean(),
  handler: async (ctx, { userId, messageKey }) =>
    Boolean(
      await ctx.db
        .query("mailEvents")
        .withIndex("by_userId_and_messageKey", (q) =>
          q.eq("userId", userId).eq("messageKey", messageKey)
        )
        .first()
    ),
})

const importTarget = internalQuery({
  args: {
    userId: v.id("users"),
    tag: v.optional(v.string()),
    threadKeys: v.array(v.string()),
    mail: v.object({ from: v.string(), fromName: v.optional(v.string()), subject: v.string() }),
  },
  returns: v.union(v.id("applications"), v.null()),
  handler: async (ctx, { userId, tag, threadKeys, mail }) => {
    const live = async (id: Id<"applications"> | undefined) => {
      const found = id && (await ctx.db.get("applications", id))
      return found && found.trashedAt === undefined ? found._id : null
    }
    const applications = await ctx.db
      .query("applications")
      .withIndex("by_userId_and_trashedAt", (q) =>
        q.eq("userId", userId).eq("trashedAt", undefined)
      )
      .order("desc")
      .take(1000)
    const candidates = applications.map(candidateOf)
    const tagged = tag && tagMatch(tag, mail.subject, candidates)
    if (tagged) return tagged.id as Id<"applications">
    for (const key of threadKeys.slice(-20).reverse()) {
      const earlier = await ctx.db
        .query("mailEvents")
        .withIndex("by_userId_and_messageKey", (q) => q.eq("userId", userId).eq("messageKey", key))
        .first()
      const id = await live(earlier?.applicationId)
      if (id) return id
    }
    return (ruleMatch(mail, candidates)?.id as Id<"applications">) ?? null
  },
})

const sortContext = internalQuery({
  args: { userId: v.id("users"), emailId: v.string() },
  returns: vSortContext,
  handler: async (ctx, { userId, emailId }) => {
    const done = await ctx.db
      .query("mailEvents")
      .withIndex("by_emailId", (q) => q.eq("emailId", emailId))
      .first()
    const email = await ctx.runQuery(components.cloudflareEmail.lib.get, { emailId })
    if (done || !email || email.owner !== userId) return null
    const connection = await ctx.db
      .query("emailConnections")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique()
    const applications = await ctx.db
      .query("applications")
      .withIndex("by_userId_and_trashedAt", (q) =>
        q.eq("userId", userId).eq("trashedAt", undefined)
      )
      .order("desc")
      .take(200)
    return {
      payload: email.payload,
      read: connection?.allow.read ?? false,
      move: connection?.allow.move ?? false,
      applications: applications.map(candidateOf),
    }
  },
})

const record = internalMutation({
  args: vRecordArgs,
  returns: v.null(),
  handler: async (ctx, { event, move, quiet }) => {
    const done = await ctx.db
      .query("mailEvents")
      .withIndex("by_emailId", (q) => q.eq("emailId", event.emailId))
      .first()
    if (done) return null
    const found =
      move && event.suggest && event.applicationId
        ? await ctx.db.get("applications", event.applicationId)
        : null
    const application = found?.trashedAt === undefined ? found : null
    if (application && event.suggest)
      await changeStatus(ctx, application, event.suggest, "Moved by Jev from an email")
    const id = await ctx.db.insert("mailEvents", {
      ...event,
      box: "inbox",
      ...(quiet && { readAt: event.at }),
      ...(application &&
        event.suggest && {
          suggest: undefined,
          moved: { from: application.status, to: event.suggest },
        }),
    })
    await syncMailSummary(ctx, event.applicationId)
    if (event.applicationId)
      await ctx.scheduler.runAfter(0, internal.api.contacts.learn, { eventId: id })
    if (quiet) return null
    const filedUnder =
      event.applicationId && (await ctx.db.get("applications", event.applicationId))
    const log = workLog("mail.received", {
      userId: event.userId,
      ...(event.applicationId && { applicationId: event.applicationId }),
    })
    log.set({
      summary: filedUnder ? `Email filed under ${filedUnder.company}` : "Email waiting in Unsorted",
      outcome: filedUnder ? "filed" : "unsorted",
      kind: event.kind,
      by: event.by,
    })
    await keepLog(ctx, log)
    await ctx.runMutation(components.notifications.lib.notify, {
      owner: event.userId,
      kind: mailNotificationKind(event.kind, event.applicationId !== undefined),
      ref: id,
    })
    await fireEvent(ctx, event.userId, {
      kind: "mail",
      mailKind: event.kind,
      mailEventId: id,
      ...(event.applicationId && { applicationId: event.applicationId }),
    })
    return null
  },
})

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

// An interview's slot is sealed and can be weeks after its email, so between two times the
// newest interview mail is opened too, for slots in that range.
const timeline = authedQuery({
  args: { from: v.optional(v.number()), to: v.optional(v.number()) },
  returns: vTimeline,
  handler: async (ctx, { from, to }) => {
    const k = await keys().catch(() => null)
    if (!k) return []
    const ranged = from !== undefined && to !== undefined
    const recent = await ctx.db
      .query("mailEvents")
      .withIndex("by_userId_and_at", (q) =>
        ranged
          ? q.eq("userId", ctx.userId).gte("at", from).lte("at", to)
          : q.eq("userId", ctx.userId)
      )
      .order("desc")
      .take(300)
    const interviews = ranged
      ? await ctx.db
          .query("mailEvents")
          .withIndex("by_userId_and_kind_and_at", (q) =>
            q.eq("userId", ctx.userId).eq("kind", "interview")
          )
          .order("desc")
          .take(100)
      : []
    const shown = new Set(recent.map((e) => e._id))
    const lines = await linesOf(k, ctx.userId, [
      ...recent.filter((e) => e.box !== "trash"),
      ...interviews.filter((e) => e.box !== "trash" && !shown.has(e._id)),
    ])
    return lines
      .filter((e) => shown.has(e.id) || (e.slot !== undefined && e.slot >= from! && e.slot <= to!))
      .sort((a, b) => b.at - a.at)
  },
})

const pageOfMail = async (
  ctx: CustomCtx<typeof authedQuery>,
  applicationId: Id<"applications"> | undefined,
  paginationOpts: PaginationOptions
) => {
  const page = await ctx.db
    .query("mailEvents")
    .withIndex("by_userId_and_applicationId_and_at", (q) =>
      q.eq("userId", ctx.userId).eq("applicationId", applicationId)
    )
    .order("desc")
    .filter((q) => q.neq(q.field("box"), "trash"))
    .paginate(paginationOpts)
  const k = await keys().catch(() => null)
  return { ...page, page: k ? await linesOf(k, ctx.userId, page.page) : [] }
}

const forApplication = authedQuery({
  args: { applicationId: v.id("applications"), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(vMailLine),
  handler: (ctx, { applicationId, paginationOpts }) =>
    pageOfMail(ctx, applicationId, paginationOpts),
})

const unsorted = authedQuery({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(vMailLine),
  handler: (ctx, { paginationOpts }) => pageOfMail(ctx, undefined, paginationOpts),
})

const unsortedCount = authedQuery({
  args: {},
  returns: v.number(),
  handler: async (ctx) =>
    (
      await ctx.db
        .query("mailEvents")
        .withIndex("by_userId_and_applicationId_and_at", (q) =>
          q.eq("userId", ctx.userId).eq("applicationId", undefined)
        )
        .filter((q) => q.neq(q.field("box"), "trash"))
        .take(maxUnsortedCount)
    ).length,
})

const resolveSuggestion = authedMutation({
  args: { eventId: v.id("mailEvents"), accept: v.boolean() },
  returns: v.null(),
  handler: async (ctx, { eventId, accept }) => {
    const event = await ownEvent(ctx, ctx.userId, eventId)
    if (accept && event.suggest && event.applicationId) {
      const application = await ctx.db.get("applications", event.applicationId)
      if (application?.userId === ctx.userId)
        await changeStatus(ctx, application, event.suggest, "From an email")
    }
    await ctx.db.patch("mailEvents", eventId, { suggest: undefined })
    return null
  },
})

const mailBody = authedQuery({
  args: { eventId: v.id("mailEvents") },
  returns: vMailBody,
  handler: async (ctx, { eventId }) => {
    const event = await ctx.db.get("mailEvents", eventId)
    if (event?.userId !== ctx.userId) return null
    const email = await ctx.runQuery(components.cloudflareEmail.lib.get, { emailId: event.emailId })
    const k = await keys().catch(() => null)
    const mail = email && k && (await openJson(k, email.payload, aad.email(ctx.userId), Received))
    if (!mail) return null
    return {
      text: (mail.text?.trim() || textOfHtml(mail.html ?? "")).slice(0, 20_000),
      from: mail.from,
      to: mail.to.join(", "),
      subject: mail.subject,
      attachments: mail.attachments,
    }
  },
})

const undoMove = authedMutation({
  args: { eventId: v.id("mailEvents") },
  returns: v.null(),
  handler: async (ctx, { eventId }) => {
    const event = await ownEvent(ctx, ctx.userId, eventId)
    const application =
      event.applicationId && (await ctx.db.get("applications", event.applicationId))
    if (event.moved && application?.userId === ctx.userId)
      await changeStatus(ctx, application, event.moved.from, "Undid Jev's move")
    await ctx.db.patch("mailEvents", eventId, { moved: undefined })
    return null
  },
})

const assign = authedMutation({
  args: { eventId: v.id("mailEvents"), applicationId: v.optional(v.id("applications")) },
  returns: v.null(),
  handler: async (ctx, { eventId, applicationId }) => {
    const event = await ownEvent(ctx, ctx.userId, eventId)
    const application = applicationId && (await ctx.db.get("applications", applicationId))
    if (applicationId && application?.userId !== ctx.userId)
      throw new ConvexError("That application isn't yours.")
    await ctx.db.patch("mailEvents", eventId, {
      applicationId,
      by: "you",
      suggest: application ? suggestionOf(event.kind, application.status) : undefined,
    })
    await syncMailSummary(ctx, event.applicationId)
    if (applicationId !== event.applicationId) await syncMailSummary(ctx, applicationId)
    if (application && !event.applicationId)
      await ctx.scheduler.runAfter(0, internal.api.contacts.learn, { eventId })
    await logEdit(
      ctx,
      ctx.userId,
      "mail.assign",
      application ? `Moved an email to ${application.company}` : "Moved an email to Unsorted",
      applicationId && { applicationId }
    )
    return null
  },
})

export const sortApi = {
  knownMessage,
  importTarget,
  mailBody,
  sortContext,
  threadOf,
  record,
  sortMail,
  timeline,
  forApplication,
  unsorted,
  unsortedCount,
  resolveSuggestion,
  undoMove,
  assign,
}
