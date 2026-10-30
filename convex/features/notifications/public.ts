import { type } from "arktype"
import { v } from "convex/values"
import { components, internal } from "../../_generated/api"
import { internalMutation, type MutationCtx } from "../../_generated/server"
import { arkMutation, authedQuery } from "../../lib/functions"
import { statuses } from "../applications/validators"
import { aad, keys, openJson } from "../email/internal"
import type { Kind } from "../email/match"
import { MailNote } from "../email/models"
import { notificationKindKeys } from "./kinds"

const mailWords: Record<Kind, string> = {
  confirmation: "Application received",
  interview: "Interview",
  rejection: "Rejected",
  offer: "Offer",
  portal: "Portal update",
  other: "Email",
}

// The inbox, newest first. Each line is built from what it points at, so a mail line
// opens the sealed mail event here and nowhere else. Lines whose source is gone are left out.
const inbox = authedQuery({
  args: {},
  returns: v.array(
    v.object({
      id: v.string(),
      title: v.string(),
      message: v.string(),
      at: v.number(),
      unread: v.boolean(),
      // Where its button goes; none for a line with nowhere better to go.
      link: v.union(
        v.literal("/"),
        v.literal("/loops"),
        v.literal("/calendar"),
        v.literal("/activity"),
        v.null()
      ),
      company: v.optional(v.string()),
      status: v.optional(v.union(...statuses.map((s) => v.literal(s)))),
      // For a workflow's message: the run it came from, to open its history.
      run: v.optional(
        v.object({ automationId: v.id("automations"), runId: v.id("automationRuns") })
      ),
    })
  ),
  handler: async (ctx) => {
    const rows = await ctx.runQuery(components.notifications.lib.list, {
      owner: ctx.userId,
      limit: 100,
    })
    const k = await keys().catch(() => null)
    const lines = await Promise.all(
      rows.map(async (n) => {
        const base = { id: n._id, at: n.at, unread: n.readAt === undefined }
        const applyId =
          (n.kind === "apply.done" || n.kind === "apply.needsYou") &&
          n.ref &&
          ctx.db.normalizeId("autoApplies", n.ref)
        if (applyId) {
          const row = await ctx.db.get("autoApplies", applyId)
          return (
            row?.userId === ctx.userId && {
              ...base,
              title: `${row.title} · ${row.company}`,
              message:
                n.kind === "apply.done"
                  ? "Applied for you."
                  : (row.error ?? "Needs you before it can be sent."),
              link: "/activity" as const,
              company: row.company,
              status: row.status === "applied" ? ("applied" as const) : undefined,
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
  },
})

const unreadCount = authedQuery({
  args: {},
  returns: v.number(),
  handler: (ctx) =>
    ctx.runQuery(components.notifications.lib.unreadCount, { owner: ctx.userId, limit: 100 }),
})

// Marks notifications read or unread; with no ids, every unread one is marked read.
const setRead = arkMutation({
  args: type({ "ids?": "string[]", read: "boolean" }),
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

const setOn = arkMutation({
  args: type({ kind: type.enumerated(...notificationKindKeys), on: "boolean" }),
  returns: v.null(),
  handler: async (ctx, { kind, on }) => {
    await ctx.runMutation(components.notifications.lib.setMuted, {
      owner: ctx.userId,
      kind,
      muted: !on,
    })
    return null
  },
})

const removeNotifications = internalMutation({
  args: { owner: v.string() },
  returns: v.null(),
  handler: async (ctx, { owner }) => {
    const more = await ctx.runMutation(components.notifications.lib.removeOwner, { owner })
    if (more) await ctx.scheduler.runAfter(0, internal.inbox.removeNotifications, { owner })
    return null
  },
})

// For account deletion: notifications and settings go in batches.
export const deleteNotifications = (ctx: MutationCtx, owner: string) =>
  ctx.scheduler.runAfter(0, internal.inbox.removeNotifications, { owner })

export const notificationsApi = {
  inbox,
  unreadCount,
  setRead,
  settings,
  setOn,
  removeNotifications,
}
