import { describe, expect, it } from "vite-plus/test"

import { milestoneLine, parseMilestones } from "./data"

describe("parseMilestones", () => {
  it("reads one milestone per line, with a date at the end as its target", () => {
    expect(parseMilestones("Polish resume\n\n  Apply to 30 companies 2026-11-30  \n")).toEqual([
      { name: "Polish resume", done: false },
      { name: "Apply to 30 companies", done: false, target: "2026-11-30" },
    ])
  })

  it("keeps a tick while the name stays the same, and round-trips a line", () => {
    const was = [{ name: "Polish resume", done: true, target: "2026-09-30" }]
    expect(parseMilestones(milestoneLine(was[0]!), was)).toEqual(was)
    expect(parseMilestones("Polish the resume", was)[0]?.done).toBe(false)
  })
})
