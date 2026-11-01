const minute = 60_000

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

export const fromWall = (wall: number, zone: string) => {
  const guess = wall - offsetOf(wall, zone) * minute
  return wall - offsetOf(guess, zone) * minute
}

export const wallOf = (ms: number, zone: string) => {
  const d = new Date(ms + offsetOf(ms, zone) * minute)
  return {
    date: d.toISOString().slice(0, 10),
    weekday: d.getUTCDay(),
    minutes: d.getUTCHours() * 60 + d.getUTCMinutes(),
  }
}

export const instantOf = (ms: number) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z")
