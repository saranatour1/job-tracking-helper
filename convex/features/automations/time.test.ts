import { describe, expect, it } from "vite-plus/test"

import { fromWall, instantOf, offsetOf, wallOf } from "./time"

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
