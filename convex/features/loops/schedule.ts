// When a loop runs next: the next time the clock reads `at` (like "08:00") in the
// person's time zone, after `now`. Plain Intl, so it handles daylight saving without
// a date library.

// How far ahead of UTC a time zone is at a given moment, in milliseconds.
const offsetAt = (timeZone: string, ms: number) => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(ms)
      .map((p) => [p.type, Number(p.value)])
  )
  const asUtc = Date.UTC(
    parts.year!,
    parts.month! - 1,
    parts.day!,
    parts.hour!,
    parts.minute!,
    parts.second!
  )
  return asUtc - Math.floor(ms / 1000) * 1000
}

// The UTC moment when a date's wall clock reads hours:minutes in the time zone.
const atWallClock = (
  timeZone: string,
  y: number,
  m: number,
  d: number,
  hours: number,
  minutes: number
) => {
  const guess = Date.UTC(y, m, d, hours, minutes)
  return guess - offsetAt(timeZone, guess - offsetAt(timeZone, guess))
}

export const isTimeZone = (timeZone: string) => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone })
    return true
  } catch {
    return false
  }
}

export const nextRunAt = (now: number, at: string, timeZone: string) => {
  const [hours, minutes] = at.split(":").map(Number) as [number, number]
  const local = new Date(now + offsetAt(timeZone, now))
  for (let days = 0; days < 3; days++) {
    const run = atWallClock(
      timeZone,
      local.getUTCFullYear(),
      local.getUTCMonth(),
      local.getUTCDate() + days,
      hours,
      minutes
    )
    if (run > now) return run
  }
  throw new Error(`No next run for ${at} in ${timeZone}`)
}
