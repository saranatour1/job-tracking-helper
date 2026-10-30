import { type } from "arktype"
import { v } from "convex/values"
import { arkId } from "../../lib/ark"
import { isTimeZone } from "../loops/schedule"

export const maxPages = 20
// A page fills up rather than letting anyone flood your calendar.
export const maxUpcoming = 50
export const lengths = [15, 30, 45, 60, 90]

const trimmed = type("string.trim")

// What a booking page offers, set by its host. Hours are in the host's zone.
export const PageFields = type({
  title: trimmed.to(
    type("0 < string <= 80").configure({ message: "Give the page a title, up to 80 characters." })
  ),
  minutes: "number",
  startHour: "number",
  endHour: "number",
  // Repeats and days that don't exist drop out.
  days: type("number[]")
    .pipe((days) => [...new Set(days)].filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))
    .to("number[]"),
  noticeHours: "number",
  horizonDays: "number",
  timeZone: "string",
  // Bookings go under this application; without one, by the guest's email domain.
  "applicationId?": arkId("applications"),
  // Where the call happens: a room, "Phone", or a video link.
  "location?": trimmed.to("string <= 300"),
  active: "boolean",
})

const pageProblem = (page: typeof PageFields.infer) => {
  const whole = [page.startHour, page.endHour, page.noticeHours, page.horizonDays]
  if (!lengths.includes(page.minutes)) return "Pick a length from the list."
  if (!whole.every(Number.isInteger) || page.startHour < 0 || page.endHour > 24)
    return "Hours run from 0 to 24."
  if (page.startHour * 60 + page.minutes > page.endHour * 60)
    return "The hours have to fit at least one booking."
  if (!page.days.length) return "Pick at least one day."
  if (
    page.noticeHours < 0 ||
    page.noticeHours > 168 ||
    page.horizonDays < 1 ||
    page.horizonDays > 90
  )
    return "Notice is up to a week, and pages open up to 90 days ahead."
  if (!isTimeZone(page.timeZone)) return "That isn't a time zone."
}

// With `id`, changes that page of yours.
export const SavePage = type({ "id?": arkId("bookingPages") })
  .and(PageFields)
  .narrow((page, ctx) => {
    const problem = pageProblem(page)
    return !problem || ctx.reject({ message: problem })
  })

export const BookingPage = PageFields.and({ userId: arkId("users"), slug: "string" })

// What a guest sends to book a time. Public, so every rule runs here.
export const Booking = type({
  slug: "string",
  start: "number",
  name: trimmed.to(
    type("0 < string <= 100").configure({ message: "Add your name, up to 100 characters." })
  ),
  email: trimmed
    .pipe((email) => email.toLowerCase())
    .to(
      type(/^(?=.{1,200}$)[^\s@]+@[^\s@]+\.[^\s@]+$/).configure({
        message: "That email doesn't look right.",
      })
    ),
  "note?": trimmed.to("string <= 1000"),
})

export const vHours = {
  minutes: v.number(),
  startHour: v.number(),
  endHour: v.number(),
  days: v.array(v.number()),
  noticeHours: v.number(),
  horizonDays: v.number(),
  timeZone: v.string(),
}

export const vGuestPage = v.union(
  v.null(),
  v.object({
    title: v.string(),
    host: v.string(),
    location: v.optional(v.string()),
    hours: v.object(vHours),
    busy: v.array(v.object({ start: v.number(), end: v.number() })),
  })
)

export const vBooked = v.object({
  key: v.string(),
  title: v.string(),
  start: v.string(),
  end: v.string(),
  location: v.optional(v.string()),
})
