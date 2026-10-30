import type { QueryCtx, MutationCtx } from "../../_generated/server"
import type { Id } from "../../_generated/dataModel"
import { type Window, fromWall, type Hours } from "./slots"
import { keys, openJson, aad } from "../email/utils"
import { MailNote } from "../email/validators"

export const hour = 3_600_000

export const day = 24 * hour

/**
 * The host's busy time between `from` and `to`: their saved events and, unless moved or
 * removed, the interview slots their mail proposed. Only the times leave this function.
 */
export const busyOf = async (
  ctx: QueryCtx,
  userId: Id<"users">,
  zone: string,
  from: number,
  to: number
): Promise<Window[]> => {
  // shortcut: one-off events only; a repeating event blocks its first time, not the rest.
  const rows = await ctx.db
    .query("calendarEvents")
    .withIndex("by_userId_and_key", (q) => q.eq("userId", userId))
    .take(500)
  const replaced = new Set(rows.flatMap((r) => (r.replaces ? [r.replaces] : [])))
  const busy: Window[] = rows
    .filter((r) => !r.hidden && r.busy !== false)
    .map((r) =>
      r.allDay
        ? {
            start: fromWall(Date.parse(`${r.start}T00:00Z`), zone),
            end: fromWall(Date.parse(`${r.end}T00:00Z`), zone),
          }
        : { start: Date.parse(r.start), end: Date.parse(r.end) }
    )
  const k = await keys().catch(() => null)
  if (k) {
    const mail = await ctx.db
      .query("mailEvents")
      .withIndex("by_userId_and_applicationId", (q) => q.eq("userId", userId))
      .take(300)
    for (const m of mail) {
      if (m.kind !== "interview" || replaced.has(`${m._id}:slot`)) continue
      const note = await openJson(k, m.note, aad.email(userId), MailNote)
      if (!note?.slot) continue
      const start = fromWall(note.slot, note.slotZone ?? zone)
      busy.push({ start, end: start + hour })
    }
  }
  return busy.filter((w) => w.end > from && w.start < to)
}

export const pageBySlug = (ctx: QueryCtx, slug: string) =>
  ctx.db
    .query("bookingPages")
    .withIndex("by_slug", (q) => q.eq("slug", slug))
    .unique()

export const hoursOf = (page: Hours): Hours => ({
  minutes: page.minutes,
  startHour: page.startHour,
  endHour: page.endHour,
  days: page.days,
  noticeHours: page.noticeHours,
  horizonDays: page.horizonDays,
  timeZone: page.timeZone,
})

// For account deletion.
export const deleteBookingPages = async (ctx: MutationCtx, userId: Id<"users">) => {
  for await (const row of ctx.db
    .query("bookingPages")
    .withIndex("by_userId", (q) => q.eq("userId", userId)))
    await ctx.db.delete("bookingPages", row._id)
}
