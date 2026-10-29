import { describe, expect, it } from "vite-plus/test"

import { fill, nextScheduledAt, problemOf, stepAt } from "./validators"

describe("fill", () => {
  it("fills known names and leaves the rest as written", () => {
    expect(
      fill("Ping {application.company} about {application.role}", { "application.company": "Acme" })
    ).toBe("Ping Acme about {application.role}")
  })
  it("never runs what it's given", () => {
    expect(fill("{constructor.name} ${process.env} {{x}}", {})).toBe(
      "{constructor.name} ${process.env} {{x}}"
    )
  })
})

describe("problemOf", () => {
  const manual = { kind: "manual" as const }
  const note = { kind: "notify" as const, message: "Hi" }
  it("accepts a simple workflow", () => {
    expect(problemOf("Morning nudge", manual, [note])).toBeUndefined()
  })
  it("refuses no name, no steps, too many steps and bad steps", () => {
    expect(problemOf(" ", manual, [note])).toBeDefined()
    expect(problemOf("x", manual, [])).toBeDefined()
    expect(
      problemOf(
        "x",
        manual,
        Array.from({ length: 21 }, () => note)
      )
    ).toBeDefined()
    expect(problemOf("x", manual, [{ kind: "wait", minutes: 0 }])).toBeDefined()
    expect(problemOf("x", manual, [{ kind: "wait", minutes: 1.5 }])).toBeDefined()
    expect(problemOf("x", manual, [{ kind: "notify", message: "" }])).toBeDefined()
  })
  it("checks a schedule's time, days and zone", () => {
    const at = { kind: "schedule" as const, at: "09:00", days: [1], timeZone: "Europe/Berlin" }
    expect(problemOf("x", at, [note])).toBeUndefined()
    expect(problemOf("x", { ...at, at: "9am" }, [note])).toBeDefined()
    expect(problemOf("x", { ...at, days: [] }, [note])).toBeDefined()
    expect(problemOf("x", { ...at, timeZone: "Mars/Base" }, [note])).toBeDefined()
  })
})

describe("paths", () => {
  const notify = (message: string) => ({ kind: "notify" as const, message })
  const split = (paths: { label: string; steps: ReturnType<typeof notify>[] }[]) => ({
    kind: "parallel" as const,
    paths,
  })
  it("finds a step by its place", () => {
    const steps = [
      notify("a"),
      split([
        { label: "x", steps: [notify("b")] },
        { label: "y", steps: [notify("c"), notify("d")] },
      ]),
    ]
    expect(stepAt(steps, "0")).toEqual(notify("a"))
    expect(stepAt(steps, "1.1.1")).toEqual(notify("d"))
    expect(stepAt(steps, "1.2.0")).toBeUndefined()
    expect(stepAt(steps, "0.0.0")).toBeUndefined()
  })
  it("wants 2 to 4 named paths, none empty, and counts every block", () => {
    const manual = { kind: "manual" as const }
    const path = { label: "p", steps: [notify("a")] }
    expect(problemOf("x", manual, [split([path, path])])).toBeUndefined()
    expect(problemOf("x", manual, [split([path])])).toBeDefined()
    expect(
      problemOf("x", manual, [split([path, { label: " ", steps: [notify("a")] }])])
    ).toBeDefined()
    expect(problemOf("x", manual, [split([path, { label: "q", steps: [] }])])).toBeDefined()
    const long = { label: "p", steps: Array.from({ length: 11 }, () => notify("a")) }
    expect(problemOf("x", manual, [split([long, long])])).toBeDefined()
  })
})

describe("nextScheduledAt", () => {
  // Thursday, October 29 2026, 08:00 UTC.
  const now = Date.UTC(2026, 9, 29, 8)
  it("finds the next chosen weekday at the time, in the zone", () => {
    // Weekdays at 09:00 in Berlin (UTC+1 in winter): Thursday has passed, so Friday.
    expect(
      nextScheduledAt(now, {
        kind: "schedule",
        at: "09:00",
        days: [1, 2, 3, 4, 5],
        timeZone: "Europe/Berlin",
      })
    ).toBe(Date.UTC(2026, 9, 30, 8))
    // Mondays at 09:00 in New York, after DST ends (UTC-5).
    expect(
      nextScheduledAt(now, {
        kind: "schedule",
        at: "09:00",
        days: [1],
        timeZone: "America/New_York",
      })
    ).toBe(Date.UTC(2026, 10, 2, 14))
  })
  it("can fire later the same day", () => {
    expect(
      nextScheduledAt(now, { kind: "schedule", at: "18:30", days: [4], timeZone: "UTC" })
    ).toBe(Date.UTC(2026, 9, 29, 18, 30))
  })
})
