// Sorting incoming mail: each email becomes a timeline event on the application it's
// about, with what it says and any status it suggests. Rules decide by default; Jev
// decides when the person lets it read their mail.
import { convexGateway } from "@convex-dev/ai-sdk-provider"
import { type } from "arktype"
import { experimental_decide as decide } from "ai"
import { ConvexError, v } from "convex/values"
import { components, internal } from "../../../_generated/api"
import type { Id } from "../../../_generated/dataModel"
import {
  internalAction,
  internalMutation,
  internalQuery,
  type QueryCtx,
} from "../../../_generated/server"
import { arkId, arkOutputToConvex } from "../../../lib/ark"
import { arkMutation, authedQuery } from "../../../lib/functions"
import { seal } from "../../../lib/secrets"
import { changeStatus } from "../applications/public"
import { statuses } from "../applications/validators"
import { mailNotificationKind } from "../notifications/kinds"
import { jevModel } from "../workflows/judge"
import { secretKeys } from "./inbound"
import { aad, keys, openJson } from "./internal"
import {
  type Candidate,
  type Kind,
  kindLabels,
  kindOf,
  kinds,
  portalOf,
  ruleMatch,
  suggestionOf,
} from "./match"
import { MailEvent, MailNote, Received } from "./models"

const vCandidate = v.object({
  id: v.id("applications"),
  company: v.string(),
  role: v.string(),
  status: v.union(...statuses.map((s) => v.literal(s))),
  at: v.number(),
})

// What sorting one email needs, or null when it's gone or already sorted.
const sortContext = internalQuery({
  args: { userId: v.id("users"), emailId: v.string() },
  returns: v.union(
    v.null(),
    v.object({ payload: v.string(), read: v.boolean(), applications: v.array(vCandidate) })
  ),
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
    // shortcut: the 200 newest applications; page through them if people keep more.
    const applications = await ctx.db
      .query("applications")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .order("desc")
      .take(200)
    return {
      payload: email.payload,
      read: connection?.allow.read ?? false,
      applications: applications.map((a) => ({
        id: a._id,
        company: a.company,
        role: a.role,
        status: a.status,
        at: a._creationTime,
      })),
    }
  },
})

// Saves the event and tells the inbox, unless this email was already sorted.
const record = internalMutation({
  args: arkOutputToConvex(MailEvent),
  returns: v.null(),
  handler: async (ctx, event) => {
    const done = await ctx.db
      .query("mailEvents")
      .withIndex("by_emailId", (q) => q.eq("emailId", event.emailId))
      .first()
    if (done) return null
    const id = await ctx.db.insert("mailEvents", event)
    await ctx.runMutation(components.notifications.lib.notify, {
      owner: event.userId,
      kind: mailNotificationKind(event.kind, event.applicationId !== undefined),
      ref: id,
    })
    return null
  },
})

// Two questions in one request: which application, and what the email says. An answer
// Jev isn't at least even on counts as none.
const askJev = async (
  mail: typeof Received.infer,
  applications: Candidate[]
): Promise<{ application?: Candidate; kind: Kind }> => {
  const options = Object.fromEntries(
    applications.map((a, i) => [`a${i}`, `${a.company}: ${a.role}`])
  )
  const result = await decide({
    model: convexGateway.evaluationModel(jevModel),
    state: {
      email: {
        from: mail.fromName ? `${mail.fromName} <${mail.from}>` : mail.from,
        subject: mail.subject,
        text: (mail.text ?? "").slice(0, 4000),
      },
      applications: Object.values(options),
    },
    questions: {
      application: {
        type: "choice",
        instructions:
          "Which of `applications` (company: role) is `email` about? Pick the one the email names or clearly refers to, or none when it's about none of them.",
        criteria: { ...options, none: "None of these" },
      },
      kind: {
        type: "choice",
        instructions: "What does `email` tell the person about their job application?",
        criteria: kindLabels,
      },
    },
  })
  const answers = result.answers as Record<
    string,
    { choice?: string; probabilities?: Record<string, number> }
  >
  const sure = (a?: { choice?: string; probabilities?: Record<string, number> }) =>
    a?.choice && (a.probabilities?.[a.choice] ?? 0) >= 0.5 ? a.choice : undefined
  const picked = sure(answers.application)
  const kind = sure(answers.kind)
  return {
    application: picked?.startsWith("a") ? applications[Number(picked.slice(1))] : undefined,
    kind: kinds.find((k) => k === kind) ?? "other",
  }
}

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
    let application: Candidate | undefined = ruleMatch(mail, context.applications)
    let kind = kindOf(mail.subject, text)
    let by: "rules" | "jev" = "rules"
    if (context.read && context.applications.length)
      // If Jev can't be reached, the rules' answer stands.
      await askJev(mail, context.applications).then(
        (answer) => {
          ;({ application, kind } = answer)
          by = "jev"
        },
        () => null
      )
    const chosen = context.applications.find((a) => a.id === application?.id)
    const portalUrl = portalOf(kind, text, mail.html)
    await ctx.runMutation(internal.email.record, {
      userId,
      emailId,
      applicationId: chosen?.id,
      kind,
      at: Date.now(),
      note: await seal(
        k,
        JSON.stringify({ from: mail.fromName || mail.from, subject: mail.subject, portalUrl }),
        aad.email(userId)
      ),
      suggest: chosen && suggestionOf(kind, chosen.status),
      by,
    })
    return null
  },
})

// Every sorted email, opened for its owner, newest first. The page groups them by
// application; the ones without one are Unsorted.
const timeline = authedQuery({
  args: {},
  returns: v.array(
    v.object({
      id: v.id("mailEvents"),
      applicationId: v.union(v.id("applications"), v.null()),
      kind: v.union(...kinds.map((k) => v.literal(k))),
      from: v.string(),
      subject: v.string(),
      portalUrl: v.optional(v.string()),
      at: v.number(),
      suggest: v.optional(v.union(...statuses.map((s) => v.literal(s)))),
    })
  ),
  handler: async (ctx) => {
    const k = await keys().catch(() => null)
    if (!k) return []
    // shortcut: the 300 newest events; paginate per application if people get more.
    const events = await ctx.db
      .query("mailEvents")
      .withIndex("by_userId_and_applicationId", (q) => q.eq("userId", ctx.userId))
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
            at: e.at,
            suggest: e.suggest,
          }
        )
      })
    )
    return opened.filter((e) => e !== null).sort((a, b) => b.at - a.at)
  },
})

const ownEvent = async (ctx: QueryCtx, userId: Id<"users">, eventId: Id<"mailEvents">) => {
  const event = await ctx.db.get("mailEvents", eventId)
  if (event?.userId !== userId) throw new ConvexError("That email isn't yours.")
  return event
}

// Accepting sets the application's status; either way the suggestion goes.
const resolveSuggestion = arkMutation({
  args: type({ eventId: arkId("mailEvents"), accept: "boolean" }),
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

// Moves an email to another application, or back to Unsorted.
const assign = arkMutation({
  args: type({ eventId: arkId("mailEvents"), "applicationId?": arkId("applications") }),
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

export const sortApi = { sortContext, record, sortMail, timeline, resolveSuggestion, assign }
