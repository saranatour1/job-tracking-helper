import { describe, expect, it } from "vite-plus/test"

import { loopTemplates } from "../loops/catalog"
import { criteriaOf, descriptionsOf, queriesOf } from "./fit"
import { checksOf, placeOf, profileOf, questionsOf, specsOf, stateOf, verdictOf } from "./judge"

const tags = [
  { kind: "interest" as const, value: "developer tools" },
  { kind: "location" as const, value: "Berlin" },
  { kind: "location" as const, value: "Munich" },
  { kind: "avoid" as const, value: "ad tech" },
  { kind: "redFlagCompany" as const, value: "Acme" },
]
const answersOf = (id: string) => loopTemplates.find((t) => t.id === id)!.answers
const profile = (id: string, more: Partial<Parameters<typeof profileOf>[1]> = {}) =>
  profileOf(criteriaOf(answersOf(id), tags), {
    workMode: "any",
    liked: [],
    disliked: [],
    ...more,
  })
const job = { title: "Engineer", company: "Initech", location: "Berlin", remote: false, text: "…" }

describe("placeOf", () => {
  it("covers every place at once, and lets the loop's answer win over Preferences", () => {
    const c = criteriaOf(answersOf("close-to-home"), tags)
    expect(placeOf(c, "any")).toBe("In or near Berlin, Munich")
    expect(placeOf(criteriaOf(answersOf("stretch"), tags), "hybrid")).toBe(
      "Hybrid in or near Berlin, Munich"
    )
    expect(placeOf(criteriaOf(answersOf("remote-fit"), tags), "onsite")).toBe("Remote")
    expect(placeOf(criteriaOf(answersOf("stretch"), []), "any")).toBeUndefined()
  })
})

describe("queriesOf", () => {
  it("searches each kind of role in each place, and each line of their own words", () => {
    const c = criteriaOf(answersOf("close-to-home"), tags)
    expect(queriesOf(c, descriptionsOf("Frontend engineer\nDesign engineer"))).toEqual([
      "Frontend engineer Berlin",
      "Frontend engineer Munich",
      "Design engineer Berlin",
      "Design engineer Munich",
      "developer tools Berlin",
      "developer tools Munich",
    ])
  })
})

describe("questions", () => {
  it("asks one question per thing the loop cares about", () => {
    const p = profile("close-to-home", { pay: "60k EUR", visa: "No" })
    expect(specsOf(p).map((s) => s.label)).toEqual([
      "In or near Berlin, Munich",
      "developer tools",
      "ad tech",
      "Pays what you need",
      "Works with your visa situation",
    ])
    expect(Object.keys(questionsOf(p))).toEqual(["match", "c0", "c1", "c2", "c3", "c4"])
  })

  it("passes their own words and rated roles only when there are some", () => {
    const p = profile("remote-fit", { prompt: "staff infra roles", liked: ["DevX at Reddit"] })
    expect(stateOf(p, job).person).toMatchObject({
      wants: "staff infra roles",
      likedRoles: ["DevX at Reddit"],
    })
    expect("dislikedRoles" in stateOf(p, job).person).toBe(false)
  })
})

describe("checksOf and verdictOf", () => {
  const p = profile("close-to-home")
  const answer = (...outcomes: ("holds" | "fails" | "unclear")[]) =>
    outcomes.map((outcome) => ({ outcome, confidence: 0.9 }))

  it("sorts each answer into fits, could fit and doesn't fit", () => {
    expect(checksOf(p, job, answer("holds", "unclear", "fails"))).toEqual([
      {
        kind: "need",
        label: "In or near Berlin, Munich",
        result: "fits",
        confidence: 0.9,
        must: true,
      },
      { kind: "want", label: "developer tools", result: "maybe", confidence: 0.9 },
      { kind: "avoid", label: "No ad tech", result: "fits", confidence: 0.9 },
    ])
  })

  it("leaves out a want that doesn't hold, and flags red-flag companies in code", () => {
    const checks = checksOf(p, { company: "Acme GmbH" }, answer("holds", "fails", "fails"))
    expect(checks.map((c) => c.label)).toEqual([
      "In or near Berlin, Munich",
      "No ad tech",
      "At Acme GmbH, on your red-flag list",
    ])
  })

  it("doesn't rule a role out on an unsure answer", () => {
    const unsure = (outcome: "holds" | "fails") => ({ outcome, confidence: 0.59 })
    const sure = { outcome: "holds" as const, confidence: 0.9 }
    const checks = checksOf(p, job, [sure, sure, unsure("holds")])
    expect(checks[2]).toMatchObject({ label: "Might involve ad tech", result: "maybe" })
    expect(verdictOf(2.4, checks, "m").verdict).toBe("fit")
    const need = profile("close-to-home", { pay: "60k EUR" })
    const pay = checksOf(need, job, [sure, sure, sure, unsure("fails")])
    expect(pay[3]).toMatchObject({ label: "Pays what you need", result: "maybe" })
    expect(
      checksOf(need, job, [sure, sure, sure, { ...unsure("fails"), confidence: 0.6 }])[3]
    ).toMatchObject({ result: "notFit" })
  })

  it("still needs the place confirmed when the answer against it is unsure", () => {
    const checks = checksOf(p, job, [
      { outcome: "fails", confidence: 0.5 },
      { outcome: "holds", confidence: 0.9 },
      { outcome: "fails", confidence: 0.9 },
    ])
    expect(verdictOf(2.8, checks, "m").verdict).toBe("notFit")
  })

  it("marks a fit near the line as a close call", () => {
    const fits = checksOf(p, job, answer("holds", "holds", "fails"))
    const close = "A close call: the match is near the line for showing a role."
    expect(verdictOf(1.59, fits, "m").verdict).toBe("notFit")
    expect(verdictOf(1.6, fits, "m")).toMatchObject({ verdict: "fit" })
    expect(verdictOf(1.6, fits, "m").reasons).toContain(close)
    expect(verdictOf(1.99, fits, "m").reasons).toContain(close)
    expect(verdictOf(2, fits, "m").reasons).not.toContain(close)
  })

  it("shows a role only when it matches and every must-have is confirmed", () => {
    const fits = checksOf(p, job, answer("holds", "holds", "fails"))
    expect(verdictOf(2.4, fits, "m").verdict).toBe("fit")
    expect(verdictOf(1.2, fits, "m").verdict).toBe("notFit")
    const unclearPlace = checksOf(p, job, answer("unclear", "holds", "fails"))
    expect(verdictOf(2.8, unclearPlace, "m")).toMatchObject({
      verdict: "notFit",
      reasons: [
        "A strong match for what you want.",
        "The posting doesn't confirm: In or near Berlin, Munich.",
      ],
    })
    const avoided = checksOf(p, job, answer("holds", "holds", "holds"))
    expect(verdictOf(2.8, avoided, "m").reasons).toContain("It misses: Involves ad tech.")
    const away = checksOf(p, job, answer("fails", "holds", "fails"))
    expect(verdictOf(2.8, away, "m").reasons).toEqual([
      "A strong match for what you want.",
      "It misses: In or near Berlin, Munich.",
    ])
  })
})
