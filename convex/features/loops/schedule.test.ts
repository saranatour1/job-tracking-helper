import { describe, expect, it } from "vite-plus/test"

import { isTimeZone, nextRunAt } from "./schedule"

const iso = (ms: number) => new Date(ms).toISOString()

describe("nextRunAt", () => {
  it("runs later today when the time hasn't passed yet", () => {
    expect(iso(nextRunAt(Date.parse("2026-10-28T05:00:00Z"), "08:00", "UTC"))).toBe(
      "2026-10-28T08:00:00.000Z"
    )
  })

  it("runs tomorrow once today's time has passed", () => {
    expect(iso(nextRunAt(Date.parse("2026-10-28T08:00:00Z"), "08:00", "UTC"))).toBe(
      "2026-10-29T08:00:00.000Z"
    )
  })

  it("follows the person's time zone", () => {
    // 08:00 in Berlin is 07:00 UTC in winter time.
    expect(iso(nextRunAt(Date.parse("2026-11-10T03:00:00Z"), "08:00", "Europe/Berlin"))).toBe(
      "2026-11-10T07:00:00.000Z"
    )
  })

  it("keeps the wall clock across a daylight saving change", () => {
    // Berlin leaves summer time on Oct 25, 2026: 08:00 is 06:00 UTC before, 07:00 after.
    const before = nextRunAt(Date.parse("2026-10-24T05:00:00Z"), "08:00", "Europe/Berlin")
    const after = nextRunAt(before, "08:00", "Europe/Berlin")
    expect(iso(before)).toBe("2026-10-24T06:00:00.000Z")
    expect(iso(after)).toBe("2026-10-25T07:00:00.000Z")
  })

  it("knows a real time zone from a made-up one", () => {
    expect(isTimeZone("America/New_York")).toBe(true)
    expect(isTimeZone("Mars/Olympus")).toBe(false)
  })
})
