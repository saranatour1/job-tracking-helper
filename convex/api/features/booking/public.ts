import { ConvexError, v } from "convex/values"
import schema from "../../../schema"
import { components } from "../../../_generated/api"
import type { Id } from "../../../_generated/dataModel"
import { type MutationCtx, mutation, query, type QueryCtx } from "../../../_generated/server"
import { authedMutation, authedQuery } from "../../../lib/functions"
import { aad, keys, openJson } from "../email/internal"
import { ruleMatch } from "../email/match"
import { MailNote } from "../email/models"
import { vPageFields } from "./models"
import { fromWall, type Hours, instantOf, slotProblem, type Window } from "./slots"

const hour = 3_600_000
const day = 24 * hour
const maxPages = 20
// A page fills up rather than letting anyone flood your calendar.
const maxUpcoming = 50
const lengths = [15, 30, 45, 60, 90]

const pages = authedQuery({
  args: {},
  returns: v.array(schema.doc("bookingPages")),
  handler: (ctx) =>
    ctx.db
      .query("bookingPages")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
      .take(maxPages),
})

const isZone = (zone: string) => {
  try {
    new Intl.DateTimeFormat("en", { timeZone: zone })
    return true
  } catch {
    return false
  }
}

/** Adds a booking page, or changes yours with this id. */
const savePage = authedMutation({
  args: { id: v.optional(v.id("bookingPages")), ...vPageFields },
  returns: v.id("bookingPages"),
  handler: async (ctx, { id, ...page }) => {
    const title = page.title.trim().slice(0, 80)
    const days = [...new Set(page.days)].filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
    const whole = [page.startHour, page.endHour, page.noticeHours, page.horizonDays]
    if (!title) throw new ConvexError("Give the page a title.")
    if (!lengths.includes(page.minutes)) throw new ConvexError("Pick a length from the list.")
    if (!whole.every(Number.isInteger) || page.startHour < 0 || page.endHour > 24)
      throw new ConvexError("Hours run from 0 to 24.")
    if (page.startHour * 60 + page.minutes > page.endHour * 60)
      throw new ConvexError("The hours have to fit at least one booking.")
    if (!days.length) throw new ConvexError("Pick at least one day.")
    if (
      page.noticeHours < 0 ||
      page.noticeHours > 168 ||
      page.horizonDays < 1 ||
      page.horizonDays > 90
    )
      throw new ConvexError("Notice is up to a week, and pages open up to 90 days ahead.")
    if (!isZone(page.timeZone)) throw new ConvexError("That isn't a time zone.")
    if (page.applicationId) {
      const application = await ctx.db.get("applications", page.applicationId)
      if (application?.userId !== ctx.userId) throw new ConvexError("That application isn't yours.")
    }
    const row = { ...page, title, days, location: page.location?.trim().slice(0, 300) || undefined }
    if (id) {
      const existing = await ctx.db.get("bookingPages", id)
      if (existing?.userId !== ctx.userId) throw new ConvexError("That page isn't yours.")
      await ctx.db.replace("bookingPages", id, { ...row, userId: ctx.userId, slug: existing.slug })
      return id
    }
    const mine = await ctx.db
      .query("bookingPages")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
      .take(maxPages)
    if (mine.length >= maxPages) throw new ConvexError(`You can keep ${maxPages} booking pages.`)
    const slug = crypto.randomUUID().replace(/-/g, "").slice(0, 12)
    return ctx.db.insert("bookingPages", { ...row, userId: ctx.userId, slug })
  },
})

const removePage = authedMutation({
  args: { id: v.id("bookingPages") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const page = await ctx.db.get("bookingPages", id)
    if (page?.userId !== ctx.userId) throw new ConvexError("That page isn't yours.")
    await ctx.db.delete("bookingPages", id)
    return null
  },
})

/**
 * The host's busy time between `from` and `to`: their saved events and, unless moved or
 * removed, the interview slots their mail proposed. Only the times leave this function.
 */
const busyOf = async (
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

const pageBySlug = (ctx: QueryCtx, slug: string) =>
  ctx.db
    .query("bookingPages")
    .withIndex("by_slug", (q) => q.eq("slug", slug))
    .unique()

const hoursOf = (page: Hours): Hours => ({
  minutes: page.minutes,
  startHour: page.startHour,
  endHour: page.endHour,
  days: page.days,
  noticeHours: page.noticeHours,
  horizonDays: page.horizonDays,
  timeZone: page.timeZone,
})

const vHours = {
  minutes: v.number(),
  startHour: v.number(),
  endHour: v.number(),
  days: v.array(v.number()),
  noticeHours: v.number(),
  horizonDays: v.number(),
  timeZone: v.string(),
}

/** A booking page as a guest sees it: what it offers and when the host is busy. Public. */
const page = query({
  args: { slug: v.string(), from: v.number() },
  returns: v.union(
    v.null(),
    v.object({
      title: v.string(),
      host: v.string(),
      location: v.optional(v.string()),
      hours: v.object(vHours),
      busy: v.array(v.object({ start: v.number(), end: v.number() })),
    })
  ),
  handler: async (ctx, { slug, from }) => {
    const found = await pageBySlug(ctx, slug)
    if (!found?.active) return null
    const host = await ctx.db.get("users", found.userId)
    const to = from + (found.horizonDays + 1) * day
    return {
      title: found.title,
      host: host?.name || host?.userName || "Your host",
      location: found.location,
      hours: hoursOf(found),
      busy: await busyOf(ctx, found.userId, found.timeZone, from, to),
    }
  },
})

const looksLikeEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Books a time on a page, after checking it again here. Public. */
const book = mutation({
  args: {
    slug: v.string(),
    start: v.number(),
    name: v.string(),
    email: v.string(),
    note: v.optional(v.string()),
  },
  returns: v.object({
    key: v.string(),
    title: v.string(),
    start: v.string(),
    end: v.string(),
    location: v.optional(v.string()),
  }),
  handler: async (ctx: MutationCtx, args) => {
    const found = await pageBySlug(ctx, args.slug)
    if (!found?.active) throw new ConvexError("This booking page isn't open.")
    const name = args.name.trim().slice(0, 100)
    const email = args.email.trim().toLowerCase().slice(0, 200)
    if (!name) throw new ConvexError("Add your name.")
    if (!looksLikeEmail.test(email)) throw new ConvexError("That email doesn't look right.")
    const now = Date.now()
    const hours = hoursOf(found)
    const busy = await busyOf(
      ctx,
      found.userId,
      found.timeZone,
      now,
      now + (found.horizonDays + 1) * day
    )
    const problem = slotProblem(hours, args.start, busy, now)
    if (problem) throw new ConvexError(problem)

    const upcoming = (
      await ctx.db
        .query("calendarEvents")
        .withIndex("by_userId_and_key", (q) => q.eq("userId", found.userId))
        .take(500)
    ).filter((r) => r.bookingPageId === found._id && !r.hidden && Date.parse(r.end) > now)
    if (upcoming.some((r) => r.attendees?.some((a) => a.email === email)))
      throw new ConvexError("You already have a time booked here.")
    if (upcoming.length >= maxUpcoming) throw new ConvexError("This page is fully booked for now.")

    let applicationId = found.applicationId
    if (!applicationId) {
      // Like mail: a guest from acme.com books under the Acme application.
      const applications = await ctx.db
        .query("applications")
        .withIndex("by_userId", (q) => q.eq("userId", found.userId))
        .take(1000)
      const match = ruleMatch(
        { from: email, subject: "" },
        applications.map((a) => ({ ...a, id: a._id, at: a._creationTime }))
      )
      applicationId = applications.find((a) => a._id === match?.id)?._id
    }
    const booking = {
      key: `booking:${crypto.randomUUID()}`,
      title: `${found.title} with ${name}`,
      start: instantOf(args.start),
      end: instantOf(args.start + found.minutes * 60_000),
      location: found.location,
    }
    const id = await ctx.db.insert("calendarEvents", {
      ...booking,
      userId: found.userId,
      allDay: false,
      kind: "interview",
      applicationId,
      bookingPageId: found._id,
      timeZone: found.timeZone,
      description: args.note?.trim().slice(0, 1000) || undefined,
      attendees: [{ email, name, status: "accepted" }],
    })
    await ctx.runMutation(components.notifications.lib.notify, {
      owner: found.userId,
      kind: "booking.new",
      ref: id,
    })
    return booking
  },
})

// For account deletion.
export const deleteBookingPages = async (ctx: MutationCtx, userId: Id<"users">) => {
  for await (const row of ctx.db
    .query("bookingPages")
    .withIndex("by_userId", (q) => q.eq("userId", userId)))
    await ctx.db.delete("bookingPages", row._id)
}

export const bookingApi = { pages, savePage, removePage, page, book }
