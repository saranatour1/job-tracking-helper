import { describe, expect, it } from "vite-plus/test"

import { activityOf, levelOf, streakLine, streakOf, streakTitle } from "./streak"

// Noon on a day in November 2026, or before it for a negative day. The 2nd is a Monday.
const on = (day: number) => new Date(2026, 10, day, 12).getTime()
const now = on(4)

describe("streakOf", () => {
  it("is empty with nothing sent", () => {
    expect(streakOf([], now)).toEqual({
      current: 0,
      best: 0,
      total: 0,
      thisWeek: 0,
      busiestWeek: 0,
      activeWeeks: 0,
    })
  })

  it("counts weeks in a row back from this week, however many in each", () => {
    expect(streakOf([on(3), on(2), on(-2), on(-9), on(-9), on(-9)], now)).toEqual({
      current: 3,
      best: 3,
      total: 6,
      thisWeek: 2,
      busiestWeek: 3,
      activeWeeks: 3,
    })
  })

  it("keeps a run alive while this week is still empty", () => {
    expect(streakOf([on(-2), on(-9)], now)).toMatchObject({ current: 2, thisWeek: 0 })
  })

  it("ends a run after a whole week with nothing, and remembers the best", () => {
    const old = [on(-9), on(-16), on(-23)]
    expect(streakOf(old, now)).toMatchObject({ current: 0, best: 3, total: 3, activeWeeks: 3 })
    expect(streakOf([on(3), ...old], now)).toMatchObject({ current: 1, best: 3, total: 4 })
  })

  it("starts the week on the day the calendar does", () => {
    const sunday = on(1)
    expect(streakOf([sunday], now, 1).thisWeek).toBe(0)
    expect(streakOf([sunday], now, 0).thisWeek).toBe(1)
  })

  it("counts weeks across a clock change", () => {
    const beforeChange = new Date(2026, 2, 2, 12).getTime()
    const sends = Array.from({ length: 12 }, (_, i) => beforeChange + i * 7 * 86_400_000)
    expect(streakOf(sends, sends.at(-1)!).current).toBe(12)
  })
})

describe("activityOf", () => {
  it("has seven days a week, from the start of the oldest week", () => {
    const days = activityOf([], now, 3)
    expect(days).toHaveLength(21)
    expect(days[0]?.day).toBe(new Date(2026, 9, 19).getTime())
    expect(days.at(-1)?.day).toBe(new Date(2026, 10, 8).getTime())
  })

  it("counts each day and leaves out what's too old", () => {
    const days = activityOf([on(3), on(3), on(2), on(-30)], now, 2)
    expect(days.filter((d) => d.sent).map((d) => d.sent)).toEqual([1, 2])
  })

  it("marks days still to come, but not today", () => {
    const days = activityOf([], now, 1)
    expect(days.map((d) => d.future)).toEqual([false, false, false, true, true, true, true])
  })

  it("follows the calendar's first day", () => {
    expect(activityOf([], now, 1, 0)[0]?.day).toBe(new Date(2026, 10, 1).getTime())
  })
})

describe("levelOf", () => {
  it("shows one application clearly, and tops out at five", () => {
    expect([0, 1, 2, 3, 4, 5, 40].map(levelOf)).toEqual([0, 1, 2, 3, 3, 4, 4])
  })
})

describe("what it says", () => {
  const text = (sends: number[]) => {
    const streak = streakOf(sends, now)
    return [streakTitle(streak), streakLine(streak)]
  }

  it("invites a first application", () => {
    expect(text([])).toEqual(["No applications yet", "Send your first and your streak starts."])
  })

  it("marks a first week", () => {
    expect(text([on(3)])).toEqual(["1 week in a row", "This week counts."])
  })

  it("marks a run", () => {
    expect(text([on(3), on(-2)])).toEqual(["2 weeks in a row", "This week counts."])
  })

  it("asks for one more without warning about losing it", () => {
    expect(text([on(-2)])).toEqual(["1 week in a row", "One application this week keeps it going."])
  })

  it("after a gap, shows what's been sent rather than a zero", () => {
    expect(text([on(-16), on(-23)])).toEqual([
      "2 sent",
      "One application this week starts a new streak.",
    ])
  })

  it("welcomes someone back", () => {
    expect(text([on(3), on(-16)])).toEqual([
      "1 week in a row",
      "You're back. This week starts a new streak.",
    ])
  })
})
