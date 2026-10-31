import { describe, expect, it } from "vite-plus/test"

import { fromWall, type Hours, instantOf, isOpen, offsetOf, slotProblem, wallOf } from "./slots"

const hours: Hours = {
  minutes: 30,
  startHour: 9,
  endHour: 17,
  days: [1, 2, 3, 4, 5],
  noticeHours: 12,
  horizonDays: 14,
  timeZone: "America/New_York",
}
const now = Date.UTC(2026, 9, 29, 8)
const monday10 = Date.UTC(2026, 10, 2, 15)

describe("zones", () => {
  it("reads offsets either side of a DST change", () => {
    expect(offsetOf(Date.UTC(2026, 9, 29, 12), "America/New_York")).toBe(-240)
    expect(offsetOf(monday10, "America/New_York")).toBe(-300)
  })
  it("turns a wall-clock time into its moment and back", () => {
    expect(fromWall(Date.UTC(2026, 10, 2, 10), "America/New_York")).toBe(monday10)
    expect(wallOf(monday10, "America/New_York")).toEqual({
      date: "2026-11-02",
      weekday: 1,
      minutes: 600,
    })
  })
  it("writes instants kloq reads", () => {
    expect(instantOf(monday10)).toBe("2026-11-02T15:00:00Z")
  })
})

describe("slotProblem", () => {
  it("allows a free weekday slot inside the hours", () => {
    expect(slotProblem(hours, monday10, [], now)).toBeUndefined()
  })
  it("refuses weekends, early mornings, short notice, far-off days and busy time", () => {
    const saturday10 = monday10 - 2 * 86_400_000
    expect(isOpen(hours, saturday10, saturday10 + 1_800_000, [], now)).toBe(false)
    expect(slotProblem(hours, monday10 - 2 * 3_600_000, [], now)).toBeDefined()
    expect(slotProblem(hours, now + 3_600_000, [], now)).toBeDefined()
    expect(slotProblem(hours, monday10 + 20 * 86_400_000, [], now)).toBeDefined()
    expect(
      slotProblem(hours, monday10, [{ start: monday10 + 900_000, end: monday10 + 2_700_000 }], now)
    ).toBeDefined()
  })
  it("refuses a booking that runs past the end of the day", () => {
    expect(slotProblem(hours, monday10 + 6.75 * 3_600_000, [], now)).toBeDefined()
    expect(slotProblem(hours, monday10 + 6.5 * 3_600_000, [], now)).toBeUndefined()
  })
  it("wants quarter hours", () => {
    expect(slotProblem(hours, monday10 + 60_000, [], now)).toBeDefined()
  })
})
