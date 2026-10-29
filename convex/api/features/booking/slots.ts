// When a booking page is open, worked out in the host's zone. Pure, so the public page
// hatches exactly the time the server would refuse. Safe to import from the frontend.

export type Hours = {
  minutes: number
  startHour: number
  endHour: number
  /** Weekdays it's open, 0 = Sunday. */
  days: number[]
  noticeHours: number
  horizonDays: number
  timeZone: string
}
export type Window = { start: number; end: number }

const minute = 60_000
const hour = 60 * minute
const day = 24 * hour

/** Minutes east of UTC in `zone` at `ms`. */
export const offsetOf = (ms: number, zone: string) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(ms)
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value)
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second")
  )
  return Math.round((asUtc - Math.floor(ms / 1000) * 1000) / minute)
}

/** The moment a wall-clock time happens in `zone`; the wall clock is given as UTC fields. */
export const fromWall = (wall: number, zone: string) => {
  const guess = wall - offsetOf(wall, zone) * minute
  return wall - offsetOf(guess, zone) * minute
}

/** `ms` as `zone`'s wall clock: its date, weekday and minutes since midnight. */
export const wallOf = (ms: number, zone: string) => {
  const d = new Date(ms + offsetOf(ms, zone) * minute)
  return {
    date: d.toISOString().slice(0, 10),
    weekday: d.getUTCDay(),
    minutes: d.getUTCHours() * 60 + d.getUTCMinutes(),
  }
}

/** Whether all of [start, end) is open: the host's days and hours, notice, horizon, not busy. */
export const isOpen = (hours: Hours, start: number, end: number, busy: Window[], now: number) => {
  if (start < now + hours.noticeHours * hour || end > now + hours.horizonDays * day) return false
  const a = wallOf(start, hours.timeZone)
  const b = wallOf(end - 1, hours.timeZone)
  return (
    a.date === b.date &&
    hours.days.includes(a.weekday) &&
    a.minutes >= hours.startHour * 60 &&
    b.minutes + 1 <= hours.endHour * 60 &&
    !busy.some((w) => start < w.end && end > w.start)
  )
}

/** Why a booking at `start` can't happen, or undefined when it can. */
export const slotProblem = (hours: Hours, start: number, busy: Window[], now: number) => {
  if (start % (15 * minute) !== 0) return "Pick a time on the quarter hour."
  return isOpen(hours, start, start + hours.minutes * minute, busy, now)
    ? undefined
    : "That time isn't open any more. Pick another."
}

/** An instant kloq and the calendar table both read: UTC, to the second. */
export const instantOf = (ms: number) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z")
