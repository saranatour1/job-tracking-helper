// Sorting incoming mail: each email becomes a timeline event on the application it's
// about, with what it says and any status it suggests. Rules decide by default; Jev
// decides when the person lets it read their mail.
import { ConvexError, v } from "convex/values"
import { components, internal } from "../../_generated/api"
import { internalAction, internalMutation, internalQuery } from "../../_generated/server"
import { authedMutation, authedQuery } from "../../lib/functions"
import { seal } from "../../lib/secrets"
import type { Doc, Id } from "../../_generated/dataModel"
import { changeStatus } from "../applications/utils"
import { boardOf } from "../jobs/boards"
import { fireEvent } from "../automations/fire"
import { mailNotificationKind } from "../notifications/kinds"
import { numberIn } from "./addresses"
import { secretKeys, aad, keys, openJson, threadKeyOf, askJev, ownEvent } from "./utils"
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
} from "./match"
import {
  MailNote,
  Received,
  vCandidate,
  vSortContext,
  vRecordArgs,
  vTimeline,
  vMailBody,
} from "./validators"

// The application an earlier email in the same thread was filed under, newest first.
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

// The application whose own address this email was sent to.
const taggedApplication = internalQuery({
  args: { userId: v.id("users"), number: v.number() },
  returns: v.union(vCandidate, v.null()),
  handler: async (ctx, { userId, number }) => {
    const found = await ctx.db
      .query("applications")
      .withIndex("by_userId_and_number", (q) => q.eq("userId", userId).eq("number", number))
      .first()
    return found && found.trashedAt === undefined ? candidateOf(found) : null
  },
})

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

// Where an imported email belongs: its address, its thread, or a company it names.
const importTarget = internalQuery({
  args: {
    userId: v.id("users"),
    number: v.optional(v.number()),
    threadKeys: v.array(v.string()),
    mail: v.object({ from: v.string(), fromName: v.optional(v.string()), subject: v.string() }),
  },
  returns: v.union(v.id("applications"), v.null()),
  handler: async (ctx, { userId, number, threadKeys, mail }) => {
    const live = async (id: Id<"applications"> | undefined) => {
      const found = id && (await ctx.db.get("applications", id))
      return found && found.trashedAt === undefined ? found._id : null
    }
    if (number !== undefined) {
      const tagged = await ctx.db
        .query("applications")
        .withIndex("by_userId_and_number", (q) => q.eq("userId", userId).eq("number", number))
        .first()
      const id = await live(tagged?._id)
      if (id) return id
    }
    for (const key of threadKeys.slice(-20).reverse()) {
      const earlier = await ctx.db
        .query("mailEvents")
        .withIndex("by_userId_and_messageKey", (q) => q.eq("userId", userId).eq("messageKey", key))
        .first()
      const id = await live(earlier?.applicationId)
      if (id) return id
    }
    const applications = await ctx.db
      .query("applications")
      .withIndex("by_userId_and_trashedAt", (q) =>
        q.eq("userId", userId).eq("trashedAt", undefined)
      )
      .order("desc")
      .take(1000)
    return (ruleMatch(mail, applications.map(candidateOf))?.id as Id<"applications">) ?? null
  },
})

// What sorting one email needs, or null when it's gone or already sorted.
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
    // The newest 200: mail is about a recent application, and Jev reads each one.
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

// Saves the event and tells the inbox, unless this email was already sorted.
// With `move`, Jev moves the application to the status the email points to, and the
// event remembers where it was so the person can undo it.
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
    // One moved to the Trash while Jev was reading isn't moved again.
    const application = found?.trashedAt === undefined ? found : null
    if (application && event.suggest)
      await changeStatus(ctx, application, event.suggest, "Moved by Jev from an email")
    const id = await ctx.db.insert("mailEvents", {
      ...event,
      ...(application &&
        event.suggest && {
          suggest: undefined,
          moved: { from: application.status, to: event.suggest },
        }),
    })
    if (quiet) return null
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

// Scheduled with only ids, so no message is ever kept in a scheduled call.
const sortMail = internalAction({
  args: { userId: v.id("users"), emailId: v.string() },
  returns: v.null(),
  handler: async (ctx, { userId, emailId }) => {
    const context = await ctx.runQuery(internal.email.sortContext, { userId, emailId })
    if (!context) return null
    const k = await secretKeys()
    const mail = await openJson(k, context.payload, aad.email(userId), Received)
    if (!mail) return null
    const text = mail.text ?? ""
    // Sent to an application's own address: nothing else needs to guess.
    const number = numberIn(mail.to)
    const tagged =
      number === undefined
        ? null
        : await ctx.runQuery(internal.email.taggedApplication, { userId, number })
    // A reply goes where the email it answers went: the thread decides next.
    const parents = await Promise.all(
      [...messageIdsIn(mail.references), ...messageIdsIn(mail.inReplyTo)].map((id) =>
        threadKeyOf(userId, id)
      )
    )
    const threadApp = parents.length
      ? await ctx.runQuery(internal.email.threadOf, { userId, keys: parents })
      : null
    const inThread = context.applications.find((a) => a.id === threadApp)
    const known = tagged ?? inThread
    let application: Candidate | undefined = known ?? ruleMatch(mail, context.applications)
    let kind = kindOf(mail.subject, text)
    // Typed this way so TypeScript doesn't narrow it to "rules": Jev sets it in a callback.
    let by = "rules" as "rules" | "jev"
    let sureOfKind = 0
    if (context.read && context.applications.length)
      // If Jev can't be reached, the rules' answer stands.
      await askJev(mail, context.applications).then(
        (answer) => {
          ;({ kind, sureOfKind } = answer)
          // The tag or thread already knows the application; Jev only says what it means.
          // Unsure isn't a no: Jev can change a match the rules found, but not erase one.
          if (!known) application = answer.application ?? application
          by = "jev"
        },
        () => null
      )
    const chosen = tagged ?? context.applications.find((a) => a.id === application?.id)
    const portalUrl = portalOf(kind, text, mail.html)
    await ctx.runMutation(internal.email.record, {
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
      // Only Jev moves cards, only when allowed, and only when it's clearly sure.
      move: context.move && by === "jev" && sureOfKind >= 0.8,
    })
    return null
  },
})

// Every sorted email, opened for its owner, newest first. The page groups them by
// application; the ones without one are Unsorted.
const timeline = authedQuery({
  args: {},
  returns: vTimeline,
  handler: async (ctx) => {
    const k = await keys().catch(() => null)
    if (!k) return []
    // The newest 300: each one is decrypted to show, so older mail drops off the timeline.
    const events = await ctx.db
      .query("mailEvents")
      .withIndex("by_userId_and_at", (q) => q.eq("userId", ctx.userId))
      .order("desc")
      .take(300)
    const opened = await Promise.all(
      events.map(async (e) => {
        const note = await openJson(k, e.note, aad.email(ctx.userId), MailNote)
        return (
          note && {
            id: e._id,
            applicationId: e.applicationId ?? null,
            kind: e.kind,
            from: note.from,
            subject: note.subject || "(no subject)",
            portalUrl: note.portalUrl,
            slot: note.slot,
            slotZone: note.slotZone,
            at: e.at,
            sent: e.by === "sent",
            to: note.to,
            suggest: e.suggest,
            moved: e.moved,
          }
        )
      })
    )
    return opened.filter((e) => e !== null).sort((a, b) => b.at - a.at)
  },
})

// Accepting sets the application's status; either way the suggestion goes.
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

// One email's body, as postal-mime parsed it when it arrived, opened for its owner only.
// Plain text when the sender included it, else the HTML as text.
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

// Puts an application back where it was before Jev moved it.
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

// Moves an email to another application, or back to Unsorted.
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
    return null
  },
})

export const sortApi = {
  knownMessage,
  importTarget,
  mailBody,
  taggedApplication,
  sortContext,
  threadOf,
  record,
  sortMail,
  timeline,
  resolveSuggestion,
  undoMove,
  assign,
}
