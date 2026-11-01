import { describe, expect, it } from "vite-plus/test"

import type { CalEvent } from "./event-types"
import { parseInstant } from "./instant"
import { expandRecurrence } from "./recurrence"

const day = (d: number, hour = 0, minute = 0) => new Date(2026, 10, d, hour, minute).toISOString()

const weekly = (until: string, allDay = false) =>
  ({
    id: "e",
    title: "Weekly",
    start: allDay ? "2026-11-12" : day(12, 10, 45),
    end: allDay ? "2026-11-13" : day(12, 11, 15),
    allDay,
    rrule: `FREQ=WEEKLY;BYDAY=TH;UNTIL=${until}`,
  }) as CalEvent

const days = (event: CalEvent) =>
  expandRecurrence(event, {
    start: new Date(2026, 10, 1),
    end: new Date(2027, 0, 1),
  }).occurrences.map((o) => new Date(parseInstant(o.start)).getDate())

describe("a weekly repeat with no weekdays", () => {
  const rule = (rrule: string) => ({ ...weekly("20261126"), rrule }) as CalEvent

  it("stays on the event's weekday", () => {
    expect(days(rule("FREQ=WEEKLY;UNTIL=20261126"))).toEqual([12, 19, 26])
  })

  it("counts every other week from the event", () => {
    expect(days(rule("FREQ=WEEKLY;INTERVAL=2;UNTIL=20261126"))).toEqual([12, 26])
  })

  it("keeps the weekday when weeks start on Sunday", () => {
    expect(days(rule("FREQ=WEEKLY;WKST=SU;UNTIL=20261126"))).toEqual([12, 19, 26])
  })

  it("stays on the weekday across a month end", () => {
    expect(days(rule("FREQ=WEEKLY;COUNT=4"))).toEqual([12, 19, 26, 3])
  })
})

describe("a repeat's end date", () => {
  it("includes a timed event on that day when it has no time", () => {
    expect(days(weekly("20261126"))).toEqual([12, 19, 26])
  })

  it("stops at the exact time when it has one", () => {
    expect(days(weekly("20261126T104500"))).toEqual([12, 19, 26])
    expect(days(weekly("20261126T104459"))).toEqual([12, 19])
  })

  it("includes an all-day event on that day", () => {
    expect(days(weekly("20261126", true))).toEqual([12, 19, 26])
  })
})
