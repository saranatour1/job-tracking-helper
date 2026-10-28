import { describe, expect, it } from "vite-plus/test"

import { loopTemplates } from "../loops/catalog"
import { criteriaOf } from "./fit"
import { questionsOf, stateOf, verdictOf } from "./judge"

const tags = [
  { kind: "interest" as const, value: "developer tools" },
  { kind: "location" as const, value: "Berlin" },
  { kind: "avoid" as const, value: "ad tech" },
]
const profileOf = (id: string, prompt?: string) => ({
  ...criteriaOf(loopTemplates.find((t) => t.id === id)!.answers, tags),
  ...(prompt && { prompt }),
})
const job = { title: "Engineer", company: "Acme", location: "Remote", remote: true, text: "…" }

describe("questionsOf", () => {
  it("asks only what the loop needs", () => {
    expect(Object.keys(questionsOf(profileOf("remote-fit")))).toEqual(["match", "avoids"])
    expect(Object.keys(questionsOf(profileOf("close-to-home")))).toEqual([
      "match",
      "avoids",
      "inPlace",
    ])
    expect(Object.keys(questionsOf(profileOf("dream-companies")))).toEqual(["match"])
  })
})

describe("stateOf", () => {
  it("passes the person's own words only when they wrote some", () => {
    expect(stateOf(profileOf("remote-fit", "staff infra roles"), job).person.wants).toBe(
      "staff infra roles"
    )
    expect("wants" in stateOf(profileOf("remote-fit"), job).person).toBe(false)
  })
})

describe("verdictOf", () => {
  it("calls a reasonable match a fit and says why in words", () => {
    const v = verdictOf({ match: 2.4, avoids: 0.1 }, job, "jev-1.14.0")
    expect(v.verdict).toBe("fit")
    expect(v.fit).toBe(80)
    expect(v.reasons).toEqual(["A reasonable match for what you want.", "It's remote."])
    expect(v.judgment).toEqual({
      match: 2.4,
      avoids: 0.1,
      level: "A reasonable match: the kind of work they want, with some gaps",
      model: "jev-1.14.0",
    })
  })

  it("rules out a strong match that touches something to avoid or is too far", () => {
    expect(verdictOf({ match: 3, avoids: 0.8 }, job, "m").verdict).toBe("notFit")
    expect(verdictOf({ match: 3, inPlace: 0.2 }, { remote: false }, "m").verdict).toBe("notFit")
  })

  it("leaves out a weak match", () => {
    expect(verdictOf({ match: 1.2 }, job, "m").verdict).toBe("notFit")
  })
})
