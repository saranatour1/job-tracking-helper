import type { FunctionReturnType } from "convex/server"
import type { CustomCtx } from "convex-helpers/server/customFunctions"
import { v } from "convex/values"
import { components, internal } from "../../_generated/api"
import { internalMutation } from "../../_generated/server"
import { authedMutation, authedQuery } from "../../lib/functions"
import { aad, keys, openJson } from "../email/utils"
import { MailNote } from "../email/validators"
import { notificationKindKeys, notificationKinds } from "./kinds"
import { mailWords } from "./utils"
import { vInboxLines } from "./validators"
import { logEdit } from "../activity/utils"

type Ctx = CustomCtx<typeof authedQuery>

const newest = (ctx: Ctx) =>
  ctx.runQuery(components.notifications.lib.list, { owner: ctx.userId, limit: 100 })

// Each line is built from what it points at, so a mail line opens the sealed mail event here
// and nowhere else. Lines whose source is gone are left out.
const linesOf = async (
  ctx: Ctx,
  rows: FunctionReturnType<typeof components.notifications.lib.list>
) => {
  const k = await keys().catch(() => null)
  const lines = await Promise.all(
    rows.map(async (n) => {
      const base = { id: n._id, at: n.at, unread: n.readAt === undefined }
      const prefillId = n.kind === "prefill.ready" && n.ref && ctx.db.normalizeId("prefills", n.ref)
      if (prefillId) {
        const row = await ctx.db.get("prefills", prefillId)
        const left = row?.fields.filter((f) => f.required && !f.answer).length ?? 0
        return (
          row?.userId === ctx.userId && {
            ...base,
            title: `${row.title} · ${row.company}`,
            message: left
              ? `Prepared. ${left} ${left === 1 ? "question needs" : "questions need"} you.`
              : "Prepared and ready for you to check and send.",
            link: "/prefilled" as const,
            company: row.company,
            status: undefined,
          }
        )
      }
      const loopRunId = n.kind === "loop.found" && n.ref && ctx.db.normalizeId("loopRuns", n.ref)
      if (loopRunId) {
        const run = await ctx.db.get("loopRuns", loopRunId)
        return (
          run?.userId === ctx.userId && {
            ...base,
            title: run.loopName,
            message: `${run.kept ?? 0} new ${run.kept === 1 ? "role fits" : "roles fit"}. They're on your shortlist.`,
            link: "/loops" as const,
            company: undefined,
            status: undefined,
          }
        )
      }
      // "Notify me" keeps its words in the run's history; the ref is "<runId>#<step>".
      const [runPart, stepPart] = (n.ref ?? "").split("#")
      const runId =
        n.kind === "automation.notify" && runPart && ctx.db.normalizeId("automationRuns", runPart)
      if (runId) {
        const found = await ctx.db.get("automationRuns", runId)
        const said = found?.log.find((e) => e.at === stepPart)?.output
        return (
          found?.userId === ctx.userId &&
          said !== undefined && {
            ...base,
            title: found.name,
            message: said,
            link: null,
            run: { automationId: found.automationId, runId: found._id },
            company: undefined,
            status: undefined,
          }
        )
      }
      const bookingId =
        n.kind === "booking.new" && n.ref && ctx.db.normalizeId("calendarEvents", n.ref)
      if (bookingId) {
        const booking = await ctx.db.get("calendarEvents", bookingId)
        if (booking?.userId !== ctx.userId || booking.hidden) return null
        const application =
          booking.applicationId && (await ctx.db.get("applications", booking.applicationId))
        const when = new Intl.DateTimeFormat("en-US", {
          timeZone: booking.timeZone,
          weekday: "short",
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
          timeZoneName: "short",
        }).format(Date.parse(booking.start))
        return {
          ...base,
          title: "New booking",
          message: `${booking.title}, ${when}`,
          link: "/calendar" as const,
          company: application ? application.company : undefined,
          status: application ? application.status : undefined,
        }
      }
      const eventId = n.ref && ctx.db.normalizeId("mailEvents", n.ref)
      const event = eventId && (await ctx.db.get("mailEvents", eventId))
      if (!k || !event || event.userId !== ctx.userId) return null
      const note = await openJson(k, event.note, aad.email(ctx.userId), MailNote)
      const application =
        event.applicationId && (await ctx.db.get("applications", event.applicationId))
      if (!note) return null
      return {
        ...base,
        title: application ? `${application.role} · ${application.company}` : "Unsorted mail",
        message: `${application ? mailWords[event.kind] : "Needs filing"}: ${note.subject || "(no subject)"} from ${note.from}`,
        link: "/" as const,
        company: application?.company,
        status: application?.status,
      }
    })
  )
  return lines.filter((line) => !!line)
}

// Updates, newest first.
const inbox = authedQuery({
  args: {},
  returns: vInboxLines,
  handler: async (ctx) => linesOf(ctx, await newest(ctx)),
})

// What the page calls unread, so the badge can always be cleared from there. Only unread lines
// get built, which is few once someone keeps up.
const unreadCount = authedQuery({
  args: {},
  returns: v.number(),
  handler: async (ctx) =>
    (
      await linesOf(
        ctx,
        (await newest(ctx)).filter((n) => n.readAt === undefined)
      )
    ).length,
})

// Marks notifications read or unread; with no ids, every unread one is marked read.
const setRead = authedMutation({
  args: { ids: v.optional(v.array(v.string())), read: v.boolean() },
  returns: v.null(),
  handler: async (ctx, { ids, read }) => {
    // The component checks each one belongs to this person before it changes anything.
    await ctx.runMutation(components.notifications.lib.setRead, {
      owner: ctx.userId,
      ids,
      read,
    })
    return null
  },
})

// Which kinds reach the inbox, as switches for Account.
const settings = authedQuery({
  args: {},
  returns: v.array(v.object({ kind: v.string(), on: v.boolean() })),
  handler: async (ctx) => {
    const muted = await ctx.runQuery(components.notifications.lib.muted, { owner: ctx.userId })
    return notificationKindKeys.map((kind) => ({ kind, on: !muted.includes(kind) }))
  },
})

const setOn = authedMutation({
  args: { kind: v.union(...notificationKindKeys.map((k) => v.literal(k))), on: v.boolean() },
  returns: v.null(),
  handler: async (ctx, { kind, on }) => {
    await ctx.runMutation(components.notifications.lib.setMuted, {
      owner: ctx.userId,
      kind,
      muted: !on,
    })
    await logEdit(
      ctx,
      ctx.userId,
      "account.notifications",
      `Turned ${on ? "on" : "off"} ${notificationKinds[kind].label}`
    )
    return null
  },
})

const removeNotifications = internalMutation({
  args: { owner: v.string() },
  returns: v.null(),
  handler: async (ctx, { owner }) => {
    const more = await ctx.runMutation(components.notifications.lib.removeOwner, { owner })
    if (more) await ctx.scheduler.runAfter(0, internal.api.inbox.removeNotifications, { owner })
    return null
  },
})

export const notificationsApi = {
  inbox,
  unreadCount,
  setRead,
  settings,
  setOn,
  removeNotifications,
}
