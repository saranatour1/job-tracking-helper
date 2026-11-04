import { describe, expect, it } from "vite-plus/test"

import { cleanSummary, readReply } from "./summaries"
import { placesOfJob } from "./utils"

describe("cleanSummary", () => {
  it("keeps a plain sentence, without quotes or markdown", () => {
    expect(cleanSummary(' "Build **payment** APIs for merchants on a small backend team." ')).toBe(
      "Build payment APIs for merchants on a small backend team."
    )
  })

  it("drops replies that aren't a summary", () => {
    expect(cleanSummary("")).toBeNull()
    expect(cleanSummary("I can't tell what this role is from the posting.")).toBeNull()
    expect(cleanSummary("Sorry, the posting is empty.")).toBeNull()
    expect(cleanSummary("Lead the data platform team and")).toBeNull()
    expect(cleanSummary(`${"word ".repeat(70)}end.`)).toBeNull()
  })
})

describe("readReply", () => {
  it("keeps the facts a posting stated, and drops ones that don't fit their field", () => {
    expect(
      readReply(`Here you go:
{"summary": "Run deployments for public safety customers across the Nordics.", "level": "Senior",
 "workMode": "Mostly remote", "travel": "Up to 40%", "employment": "Full-time", "team": "",
 "pay": "Not stated", "reportsTo": "N/A"}`)
    ).toEqual({
      summary: "Run deployments for public safety customers across the Nordics.",
      facts: { level: "Senior", travel: "Up to 40%", employment: "Full-time" },
    })
  })

  it("keeps nothing without a usable summary", () => {
    expect(readReply('{"level": "Senior"}')).toEqual({ summary: null, facts: null })
    expect(readReply("not json")).toEqual({ summary: null, facts: null })
    expect(readReply('{"summary": "Run the team."}')).toEqual({
      summary: "Run the team.",
      facts: null,
    })
  })
})

describe("placesOfJob", () => {
  it("names cities, countries and Remote, at most three", () => {
    expect(placesOfJob("Amsterdam, North Holland, Netherlands", false)).toEqual([
      "Amsterdam",
      "Netherlands",
    ])
    expect(placesOfJob("Berlin, Germany", true)).toEqual(["Berlin", "Remote", "Germany"])
    expect(placesOfJob("", true)).toEqual(["Remote"])
    expect(placesOfJob("Belgium-Remote", true)).toEqual(["Remote", "Belgium"])
  })
})
