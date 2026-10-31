import { paginationOptsValidator } from "convex/server"
import { ConvexError, v } from "convex/values"
import { components, internal } from "../../_generated/api"
import type { Doc, Id } from "../../_generated/dataModel"
import {
  action,
  internalMutation,
  internalQuery,
  type MutationCtx,
  type QueryCtx,
} from "../../_generated/server"
import { arkMutation, authedMutation, authedQuery } from "../../lib/functions"
import { arkToConvex, checked } from "../../lib/ark"
import { seal } from "../../lib/secrets"
import { textOfHtml } from "../email/match"
import { aad, keys, openJson, ownEvent, secretKeys, userIdOf } from "../email/utils"
import { MailNote, Received } from "../email/validators"
import { draftAad, sameThread } from "./utils"
import {
  DraftDetails,
  maxLabelLength,
  maxLabels,
  maxTemplates,
  SaveDraft,
  SaveTemplate,
  vBox,
  vMailContent,
  vMailRow,
} from "./validators"

// One screen of mail. Only these rows get opened, so a big mailbox costs no more than a small one.
const rowsOf = async (ctx: QueryCtx, userId: Id<"users">, events: Doc<"mailEvents">[]) => {
  const k = await keys().catch(() => null)
  if (!k) return []
  const rows = await Promise.all(
    events.map(async (e) => {
      const note = await openJson(k, e.note, aad.email(userId), MailNote)
      if (!note) return null
      const application = e.applicationId && (await ctx.db.get("applications", e.applicationId))
      return {
        id: e._id,
        box: e.box ?? (e.by === "sent" ? ("sent" as const) : ("inbox" as const)),
        kind: e.kind,
        from: note.from,
        ...(note.to && { to: note.to }),
        subject: note.subject || "(no subject)",
        at: e.at,
        sent: e.by === "sent",
        read: e.readAt !== undefined || e.by === "sent",
        labels: e.labels ?? [],
        ...(e.applicationId && { applicationId: e.applicationId }),
        ...(application && { company: application.company }),
      }
    })
  )
  return rows.filter((r) => r !== null)
}

const page = authedQuery({
  args: {
    box: v.optional(vBox),
    label: v.optional(v.string()),
    paginationOpts: paginationOptsValidator,
  },
  returns: v.object({
    page: v.array(vMailRow),
    isDone: v.boolean(),
    continueCursor: v.string(),
    splitCursor: v.optional(v.union(v.string(), v.null())),
    pageStatus: v.optional(v.union(v.string(), v.null())),
  }),
  handler: async (ctx, { box, label, paginationOpts }) => {
    if (label !== undefined) {
      const result = await ctx.db
        .query("mailEventLabels")
        .withIndex("by_userId_and_label_and_at", (q) =>
          q.eq("userId", ctx.userId).eq("label", label)
        )
        .order("desc")
        .paginate(paginationOpts)
      const events = await Promise.all(result.page.map((r) => ctx.db.get("mailEvents", r.eventId)))
      return {
        ...result,
        page: await rowsOf(
          ctx,
          ctx.userId,
          events.filter((e) => e !== null && e.box !== "trash") as Doc<"mailEvents">[]
        ),
      }
    }
    const result = await ctx.db
      .query("mailEvents")
      .withIndex("by_userId_and_box_and_at", (q) =>
        q.eq("userId", ctx.userId).eq("box", box ?? "inbox")
      )
      .order("desc")
      .paginate(paginationOpts)
    return { ...result, page: await rowsOf(ctx, ctx.userId, result.page) }
  },
})

// One email to read, opened only when you open it. The HTML goes to a locked-down frame.
const content = authedQuery({
  args: { eventId: v.id("mailEvents") },
  returns: vMailContent,
  handler: async (ctx, { eventId }) => {
    const event = await ctx.db.get("mailEvents", eventId)
    if (event?.userId !== ctx.userId) return null
    const email = await ctx.runQuery(components.cloudflareEmail.lib.get, { emailId: event.emailId })
    const k = await keys().catch(() => null)
    const mail = email && k && (await openJson(k, email.payload, aad.email(ctx.userId), Received))
    if (!mail) return null
    return {
      from: mail.from,
      ...(mail.fromName && { fromName: mail.fromName }),
      to: mail.to.join(", "),
      subject: mail.subject || "(no subject)",
      text: (mail.text?.trim() || textOfHtml(mail.html ?? "")).slice(0, 100_000),
      ...(mail.html && { html: mail.html }),
      attachments: mail.attachments,
      sent: event.by === "sent",
    }
  },
})

// The conversation an email is part of, oldest first, across folders. Subjects are sealed and
// Cloudflare's send API returns no Message-ID, so this matches when you read rather than on save.
// shortcut: looks at the newest 200 of an application's mail, or 100 around an email with none.
// Store a thread key on each email if conversations outgrow that.
const thread = authedQuery({
  args: { eventId: v.id("mailEvents") },
  returns: v.array(vMailRow),
  handler: async (ctx, { eventId }) => {
    const event = await ctx.db.get("mailEvents", eventId)
    if (event?.userId !== ctx.userId) return []
    const { applicationId, at } = event
    const nearby = applicationId
      ? await ctx.db
          .query("mailEvents")
          .withIndex("by_userId_and_applicationId", (q) =>
            q.eq("userId", ctx.userId).eq("applicationId", applicationId)
          )
          .order("desc")
          .take(200)
      : [
          ...(await ctx.db
            .query("mailEvents")
            .withIndex("by_userId_and_at", (q) => q.eq("userId", ctx.userId).lte("at", at))
            .order("desc")
            .take(50)),
          ...(await ctx.db
            .query("mailEvents")
            .withIndex("by_userId_and_at", (q) => q.eq("userId", ctx.userId).gt("at", at))
            .take(50)),
        ]
    const rows = await rowsOf(ctx, ctx.userId, nearby)
    const opened = rows.find((r) => r.id === eventId)
    if (!opened) return []
    return rows
      .filter((r) => sameThread(r, opened) && (r.box !== "trash" || r.id === eventId))
      .sort((a, b) => a.at - b.at)
  },
})

const markRead = authedMutation({
  args: { eventId: v.id("mailEvents") },
  returns: v.null(),
  handler: async (ctx, { eventId }) => {
    const event = await ownEvent(ctx, ctx.userId, eventId)
    if (event.readAt === undefined)
      await ctx.db.patch("mailEvents", eventId, { readAt: Date.now() })
    return null
  },
})

// Archive, trash, or put back where it came from.
const move = authedMutation({
  args: {
    eventId: v.id("mailEvents"),
    to: v.union(v.literal("archived"), v.literal("trash"), v.literal("back")),
  },
  returns: v.null(),
  handler: async (ctx, { eventId, to }) => {
    const event = await ownEvent(ctx, ctx.userId, eventId)
    const home = event.by === "sent" ? ("sent" as const) : ("inbox" as const)
    await ctx.db.patch("mailEvents", eventId, { box: to === "back" ? home : to })
    return null
  },
})

const removeLabelRows = async (
  ctx: MutationCtx,
  userId: Id<"users">,
  event: Doc<"mailEvents">,
  keep: string[] = []
) => {
  for (const row of await ctx.db
    .query("mailEventLabels")
    .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
    .take(maxLabels.perEmail)) {
    if (keep.includes(row.label)) continue
    await ctx.db.delete("mailEventLabels", row._id)
    const name = await ctx.db
      .query("mailLabels")
      .withIndex("by_userId_and_name", (q) => q.eq("userId", userId).eq("name", row.label))
      .unique()
    if (name && name.count <= 1) await ctx.db.delete("mailLabels", name._id)
    else if (name) await ctx.db.patch("mailLabels", name._id, { count: name.count - 1 })
  }
}

// Only from the Trash, so it always takes two steps.
const deleteForever = authedMutation({
  args: { eventId: v.id("mailEvents") },
  returns: v.null(),
  handler: async (ctx, { eventId }) => {
    const event = await ownEvent(ctx, ctx.userId, eventId)
    if (event.box !== "trash") throw new ConvexError("Move it to the Trash first.")
    await removeLabelRows(ctx, ctx.userId, event)
    await ctx.runMutation(components.cloudflareEmail.lib.remove, {
      emailId: event.emailId,
      owner: ctx.userId,
    })
    await ctx.db.delete("mailEvents", eventId)
    return null
  },
})

const setLabels = authedMutation({
  args: { eventId: v.id("mailEvents"), labels: v.array(v.string()) },
  returns: v.null(),
  handler: async (ctx, { eventId, labels }) => {
    const event = await ownEvent(ctx, ctx.userId, eventId)
    const wanted = [...new Set(labels.map((l) => l.trim()).filter(Boolean))]
    if (wanted.some((l) => l.length > maxLabelLength))
      throw new ConvexError(`Keep a label under ${maxLabelLength} characters.`)
    if (wanted.length > maxLabels.perEmail)
      throw new ConvexError(`An email can have ${maxLabels.perEmail} labels.`)
    const had = event.labels ?? []
    await removeLabelRows(ctx, ctx.userId, event, wanted)
    for (const label of wanted.filter((l) => !had.includes(l))) {
      const name = await ctx.db
        .query("mailLabels")
        .withIndex("by_userId_and_name", (q) => q.eq("userId", ctx.userId).eq("name", label))
        .unique()
      if (name) await ctx.db.patch("mailLabels", name._id, { count: name.count + 1 })
      else {
        const all = await ctx.db
          .query("mailLabels")
          .withIndex("by_userId_and_name", (q) => q.eq("userId", ctx.userId))
          .take(maxLabels.perPerson)
        if (all.length >= maxLabels.perPerson)
          throw new ConvexError(`That's ${maxLabels.perPerson} labels. Remove one first.`)
        await ctx.db.insert("mailLabels", { userId: ctx.userId, name: label, count: 1 })
      }
      await ctx.db.insert("mailEventLabels", {
        userId: ctx.userId,
        label,
        eventId,
        at: event.at,
      })
    }
    await ctx.db.patch("mailEvents", eventId, { labels: wanted })
    return null
  },
})

const labels = authedQuery({
  args: {},
  returns: v.array(v.string()),
  handler: async (ctx) =>
    (
      await ctx.db
        .query("mailLabels")
        .withIndex("by_userId_and_name", (q) => q.eq("userId", ctx.userId))
        .take(maxLabels.perPerson)
    ).map((l) => l.name),
})

// Who it's to and its subject, for the list. The body waits until you open one.
const drafts = authedQuery({
  args: { paginationOpts: paginationOptsValidator },
  returns: v.object({
    page: v.array(
      v.object({
        id: v.id("mailDrafts"),
        to: v.string(),
        subject: v.string(),
        updatedAt: v.number(),
      })
    ),
    isDone: v.boolean(),
    continueCursor: v.string(),
    splitCursor: v.optional(v.union(v.string(), v.null())),
    pageStatus: v.optional(v.union(v.string(), v.null())),
  }),
  handler: async (ctx, { paginationOpts }) => {
    const result = await ctx.db
      .query("mailDrafts")
      .withIndex("by_userId_and_updatedAt", (q) => q.eq("userId", ctx.userId))
      .order("desc")
      .paginate(paginationOpts)
    const k = await keys().catch(() => null)
    if (!k) return { ...result, page: [] }
    const opened = await Promise.all(
      result.page.map(async (d) => {
        const details = await openJson(k, d.details, draftAad(ctx.userId), DraftDetails)
        return (
          details && {
            id: d._id,
            to: details.to,
            subject: details.subject,
            updatedAt: d.updatedAt,
          }
        )
      })
    )
    return { ...result, page: opened.filter((d) => d !== null) }
  },
})

const draft = authedQuery({
  args: { id: v.id("mailDrafts") },
  returns: v.union(
    v.null(),
    v.object({
      to: v.string(),
      subject: v.string(),
      html: v.string(),
      applicationId: v.optional(v.id("applications")),
      replyTo: v.optional(v.id("mailEvents")),
    })
  ),
  handler: async (ctx, { id }) => {
    const row = await ctx.db.get("mailDrafts", id)
    if (row?.userId !== ctx.userId) return null
    const k = await keys().catch(() => null)
    const details = k && (await openJson(k, row.details, draftAad(ctx.userId), DraftDetails))
    if (!details) return null
    return {
      to: details.to,
      subject: details.subject,
      html: details.html,
      ...(details.applicationId && { applicationId: details.applicationId as Id<"applications"> }),
      ...(details.replyTo && { replyTo: details.replyTo as Id<"mailEvents"> }),
    }
  },
})

const storeDraft = internalMutation({
  args: { userId: v.id("users"), id: v.optional(v.id("mailDrafts")), details: v.string() },
  returns: v.id("mailDrafts"),
  handler: async (ctx, { userId, id, details }) => {
    const row = id && (await ctx.db.get("mailDrafts", id))
    if (row && row.userId === userId) {
      await ctx.db.patch("mailDrafts", row._id, { details, updatedAt: Date.now() })
      return row._id
    }
    return ctx.db.insert("mailDrafts", { userId, details, updatedAt: Date.now() })
  },
})

// Sealing needs real randomness, so this is an action.
const saveDraft = action({
  args: arkToConvex(SaveDraft),
  returns: v.id("mailDrafts"),
  handler: async (ctx, args): Promise<Id<"mailDrafts">> => {
    const userId = await userIdOf(ctx)
    const { id, ...details } = checked(SaveDraft, args)
    const k = await secretKeys()
    return ctx.runMutation(internal.mailbox.storeDraft, {
      userId,
      ...(id && { id }),
      details: await seal(k, JSON.stringify(details), draftAad(userId)),
    })
  },
})

const deleteDraft = authedMutation({
  args: { id: v.id("mailDrafts") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const row = await ctx.db.get("mailDrafts", id)
    if (row?.userId === ctx.userId) await ctx.db.delete("mailDrafts", id)
    return null
  },
})

const draftsPage = internalQuery({
  args: { cursor: v.union(v.string(), v.null()) },
  returns: v.object({
    page: v.array(v.object({ id: v.id("mailDrafts"), userId: v.id("users"), details: v.string() })),
    isDone: v.boolean(),
    continueCursor: v.string(),
  }),
  handler: async (ctx, { cursor }) => {
    const result = await ctx.db.query("mailDrafts").paginate({ cursor, numItems: 100 })
    return {
      page: result.page.map((d) => ({ id: d._id, userId: d.userId, details: d.details })),
      isDone: result.isDone,
      continueCursor: result.continueCursor,
    }
  },
})

const resealDraft = internalMutation({
  args: { id: v.id("mailDrafts"), from: v.string(), details: v.string() },
  returns: v.null(),
  handler: async (ctx, { id, from, details }) => {
    const row = await ctx.db.get("mailDrafts", id)
    if (row?.details === from) await ctx.db.patch("mailDrafts", id, { details })
    return null
  },
})

const templates = authedQuery({
  args: {},
  returns: v.array(
    v.object({ id: v.id("mailTemplates"), name: v.string(), subject: v.string(), html: v.string() })
  ),
  handler: async (ctx) =>
    (
      await ctx.db
        .query("mailTemplates")
        .withIndex("by_userId_and_updatedAt", (q) => q.eq("userId", ctx.userId))
        .order("desc")
        .take(maxTemplates)
    ).map((t) => ({ id: t._id, name: t.name, subject: t.subject, html: t.html })),
})

const saveTemplate = arkMutation({
  args: SaveTemplate,
  returns: v.id("mailTemplates"),
  handler: async (ctx, { id, ...template }) => {
    if (id) {
      const row = await ctx.db.get("mailTemplates", id)
      if (row?.userId !== ctx.userId) throw new ConvexError("That template isn't here anymore.")
      await ctx.db.patch("mailTemplates", id, { ...template, updatedAt: Date.now() })
      return id
    }
    const all = await ctx.db
      .query("mailTemplates")
      .withIndex("by_userId_and_updatedAt", (q) => q.eq("userId", ctx.userId))
      .take(maxTemplates)
    if (all.length >= maxTemplates)
      throw new ConvexError(`That's ${maxTemplates} templates. Remove one first.`)
    return ctx.db.insert("mailTemplates", {
      ...template,
      userId: ctx.userId,
      updatedAt: Date.now(),
    })
  },
})

const removeTemplate = authedMutation({
  args: { id: v.id("mailTemplates") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const row = await ctx.db.get("mailTemplates", id)
    if (row?.userId === ctx.userId) await ctx.db.delete("mailTemplates", id)
    return null
  },
})

export const mailboxApi = {
  page,
  content,
  thread,
  markRead,
  move,
  deleteForever,
  setLabels,
  labels,
  drafts,
  draft,
  storeDraft,
  saveDraft,
  deleteDraft,
  draftsPage,
  resealDraft,
  templates,
  saveTemplate,
  removeTemplate,
}
