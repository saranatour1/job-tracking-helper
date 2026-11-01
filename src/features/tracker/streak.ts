export type Streak = {
  // Weeks in a row with something sent, back from this week, or from last week while this
  // one is still empty.
  current: number
  best: number
  total: number
  thisWeek: number
  busiestWeek: number
  activeWeeks: number
}

// Built from the date's parts rather than by adding milliseconds, so a clock change can't
// move a day or a week's start. Everything here is in the browser's time zone.
const dayOf = (at: number, plusDays = 0) => {
  const d = new Date(at)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + plusDays).getTime()
}

const weekOf = (at: number, weekStartsOn: number) =>
  dayOf(at, -((new Date(at).getDay() - weekStartsOn + 7) % 7))

const weeksBefore = (week: number, weeks = 1) => dayOf(week, -7 * weeks)

const countBy = (sends: number[], keyOf: (at: number) => number) => {
  const counts = new Map<number, number>()
  for (const at of sends) counts.set(keyOf(at), (counts.get(keyOf(at)) ?? 0) + 1)
  return counts
}

export const streakOf = (sends: number[], now: number, weekStartsOn = 1): Streak => {
  const counts = countBy(sends, (at) => weekOf(at, weekStartsOn))
  const thisWeek = weekOf(now, weekStartsOn)
  let current = 0
  for (
    let week = counts.has(thisWeek) ? thisWeek : weeksBefore(thisWeek);
    counts.has(week);
    week = weeksBefore(week)
  )
    current++
  let best = 0
  let run = 0
  let last: number | undefined
  for (const week of [...counts.keys()].sort((a, b) => a - b)) {
    run = last === weeksBefore(week) ? run + 1 : 1
    best = Math.max(best, run)
    last = week
  }
  return {
    current,
    best,
    total: sends.length,
    thisWeek: counts.get(thisWeek) ?? 0,
    busiestWeek: Math.max(0, ...counts.values()),
    activeWeeks: counts.size,
  }
}

/** One entry per day for the last `weeks` weeks, whole weeks, oldest first. */
export const activityOf = (sends: number[], now: number, weeks: number, weekStartsOn = 1) => {
  const counts = countBy(sends, (at) => dayOf(at))
  const start = weeksBefore(weekOf(now, weekStartsOn), weeks - 1)
  return Array.from({ length: weeks * 7 }, (_, i) => {
    const day = dayOf(start, i)
    return { day, sent: counts.get(day) ?? 0, future: day > now }
  })
}

// Fixed steps rather than a share of the busiest day, so one big day doesn't fade the rest.
export const levelOf = (sent: number) => (sent >= 5 ? 4 : sent >= 3 ? 3 : sent)

export const weeksText = (weeks: number) => `${weeks} ${weeks === 1 ? "week" : "weeks"}`

// Never a zero: after a gap, what's been sent is what's worth showing.
export const streakTitle = ({ current, total }: Streak) =>
  current ? `${weeksText(current)} in a row` : total ? `${total} sent` : "No applications yet"

// Asks for the next one and never warns about losing anything.
export const streakLine = ({ current, total, thisWeek }: Streak) => {
  if (!total) return "Send your first and your streak starts."
  if (!current) return "One application this week starts a new streak."
  if (!thisWeek) return "One application this week keeps it going."
  if (current === 1 && total > thisWeek) return "You're back. This week starts a new streak."
  return "This week counts."
}
