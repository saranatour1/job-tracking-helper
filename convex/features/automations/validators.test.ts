import { describe, expect, it } from "vite-plus/test"

import { fill, holds, nextScheduledAt, problemOf, stepAt } from "./validators"

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
  it("lets an Ask Jev answer do nothing, but wants a question and different answers", () => {
    const manual = { kind: "manual" as const }
    const decide = (question: string, ...labels: string[]) => ({
      kind: "decide" as const,
      question,
      paths: labels.map((label, i) => ({ label, steps: i === 0 ? [notify("a")] : [] })),
    })
    expect(problemOf("x", manual, [decide("Worth it?", "Yes", "No")])).toBeUndefined()
    expect(problemOf("x", manual, [decide(" ", "Yes", "No")])).toBeDefined()
    expect(problemOf("x", manual, [decide("Worth it?", "Yes", "yes ")])).toBe(
      "Give each of Jev's answers a different name."
    )
  })
})

describe("Send email and Find roles", () => {
  const manual = { kind: "manual" as const }
  const email = (to: string) => ({ kind: "sendEmail" as const, to, subject: "Hi", text: "Hello" })
  it("wants one address, or a placeholder for one", () => {
    expect(problemOf("x", manual, [email("sam@example.com")])).toBeUndefined()
    expect(problemOf("x", manual, [email("{email.from}")])).toBeUndefined()
    expect(problemOf("x", manual, [email("sam@example.com, kim@example.com")])).toBeDefined()
    expect(problemOf("x", manual, [email("Sam <sam@example.com>")])).toBeDefined()
    expect(problemOf("x", manual, [email(" ")])).toBeDefined()
  })
  it("wants a loop picked", () => {
    expect(problemOf("x", manual, [{ kind: "findRoles", loopId: "" as never }])).toBe(
      "Pick a loop to find roles with."
    )
  })
})

describe("Only go on if", () => {
  it("checks a fact's value", () => {
    expect(holds({ test: "set", value: "" }, "Hooli")).toBe(true)
    expect(holds({ test: "set", value: "" }, " ")).toBe(false)
    expect(holds({ test: "notSet", value: "" }, undefined)).toBe(true)
    expect(holds({ test: "is", value: "applied" }, "Applied")).toBe(true)
    expect(holds({ test: "isNot", value: "applied" }, "Offer")).toBe(true)
    expect(holds({ test: "atLeast", value: "1" }, "3")).toBe(true)
    expect(holds({ test: "atLeast", value: "1" }, "0")).toBe(false)
    expect(holds({ test: "atLeast", value: "1" }, undefined)).toBe(false)
  })
  it("wants a known fact, and a value where one is needed", () => {
    const manual = { kind: "manual" as const }
    const check = (fact: string, test: "is" | "atLeast", value: string) => [
      { kind: "onlyIf" as const, fact, test, value },
    ]
    expect(problemOf("x", manual, check("roles.fits", "atLeast", "1"))).toBeUndefined()
    expect(problemOf("x", manual, check("process.env", "is", "x"))).toBe("Pick what to check.")
    expect(problemOf("x", manual, check("roles.fits", "atLeast", "many"))).toBeDefined()
    expect(problemOf("x", manual, check("application.status", "is", " "))).toBeDefined()
  })
})

describe("the trigger's application", () => {
  const move = { kind: "move" as const, to: "offer" as const }
  it("needs one picked unless the trigger brings one", () => {
    expect(problemOf("x", { kind: "manual" }, [move])).toBeDefined()
    expect(problemOf("x", { kind: "status", to: [] }, [move])).toBeUndefined()
    expect(problemOf("x", { kind: "mail", kinds: [] }, [move])).toBeUndefined()
  })
})

describe("nextScheduledAt", () => {
  const now = Date.UTC(2026, 9, 29, 8)
  it("finds the next chosen weekday at the time, in the zone", () => {
    expect(
      nextScheduledAt(now, {
        kind: "schedule",
        at: "09:00",
        days: [1, 2, 3, 4, 5],
        timeZone: "Europe/Berlin",
      })
    ).toBe(Date.UTC(2026, 9, 30, 8))
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
