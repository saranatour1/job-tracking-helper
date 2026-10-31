import { ConvexError, v } from "convex/values"
import schema from "../../schema"
import { components } from "../../_generated/api"
import { type MutationCtx, mutation, query } from "../../_generated/server"
import { arkToConvex, checked } from "../../lib/ark"
import { arkMutation, authedMutation, authedQuery } from "../../lib/functions"
import { workLog } from "../../lib/log"
import { keepLog, logEdit } from "../activity/utils"
import { fireEvent } from "../automations/fire"
import { ruleMatch } from "../email/match"
import { Booking, maxPages, maxUpcoming, SavePage, vGuestPage, vBooked } from "./validators"
import { instantOf, slotProblem } from "./slots"
import { day, busyOf, pageBySlug, hoursOf } from "./utils"

const pages = authedQuery({
  args: {},
  returns: v.array(schema.doc("bookingPages")),
  handler: (ctx) =>
    ctx.db
      .query("bookingPages")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
      .take(maxPages),
})

/** Adds a booking page, or changes yours with this id. */
const savePage = arkMutation({
  args: SavePage,
  returns: v.id("bookingPages"),
  handler: async (ctx, { id, ...page }) => {
    if (page.applicationId) {
      const application = await ctx.db.get("applications", page.applicationId)
      if (application?.userId !== ctx.userId) throw new ConvexError("That application isn't yours.")
    }
    const row = { ...page, location: page.location || undefined }
    if (id) {
      const existing = await ctx.db.get("bookingPages", id)
      if (existing?.userId !== ctx.userId) throw new ConvexError("That page isn't yours.")
      await ctx.db.replace("bookingPages", id, { ...row, userId: ctx.userId, slug: existing.slug })
      await logEdit(ctx, ctx.userId, "booking.page", "Changed a booking page")
      return id
    }
    const mine = await ctx.db
      .query("bookingPages")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
      .take(maxPages)
    if (mine.length >= maxPages) throw new ConvexError(`You can keep ${maxPages} booking pages.`)
    const slug = crypto.randomUUID().replace(/-/g, "").slice(0, 12)
    await logEdit(ctx, ctx.userId, "booking.page", "Added a booking page")
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
    await logEdit(ctx, ctx.userId, "booking.page", "Removed a booking page")
    return null
  },
})

/** A booking page as a guest sees it: what it offers and when the host is busy. Public. */
const page = query({
  args: { slug: v.string(), from: v.number() },
  returns: vGuestPage,
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

/** Books a time on a page, after checking it again here. Public. */
const book = mutation({
  args: arkToConvex(Booking),
  returns: vBooked,
  handler: async (ctx: MutationCtx, sent) => {
    const { slug, start, name, email, note } = checked(Booking, sent)
    const found = await pageBySlug(ctx, slug)
    if (!found?.active) throw new ConvexError("This booking page isn't open.")
    const now = Date.now()
    const hours = hoursOf(found)
    const busy = await busyOf(
      ctx,
      found.userId,
      found.timeZone,
      now,
      now + (found.horizonDays + 1) * day
    )
    const problem = slotProblem(hours, start, busy, now)
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

    // The page's application, unless it's gone to the Trash.
    const linked = found.applicationId && (await ctx.db.get("applications", found.applicationId))
    let applicationId = linked && linked.trashedAt === undefined ? linked._id : undefined
    if (!applicationId) {
      // Like mail: a guest from acme.com books under the Acme application.
      const applications = await ctx.db
        .query("applications")
        .withIndex("by_userId_and_trashedAt", (q) =>
          q.eq("userId", found.userId).eq("trashedAt", undefined)
        )
        .order("desc")
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
      start: instantOf(start),
      end: instantOf(start + found.minutes * 60_000),
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
      description: note || undefined,
      attendees: [{ email, name, status: "accepted" }],
    })
    const log = workLog("booking.new", {
      userId: found.userId,
      ...(applicationId && { applicationId }),
    })
    log.set({ summary: `Booking on ${found.title}`, outcome: "booked" })
    await keepLog(ctx, log)
    await ctx.runMutation(components.notifications.lib.notify, {
      owner: found.userId,
      kind: "booking.new",
      ref: id,
    })
    await fireEvent(ctx, found.userId, {
      kind: "booking",
      bookingId: id,
      ...(applicationId && { applicationId }),
    })
    return booking
  },
})

export const bookingApi = { pages, savePage, removePage, page, book }
