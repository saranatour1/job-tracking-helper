import { describe, expect, it } from "vite-plus/test"

import { checksOf, contactOf, readReview, sectionsOf, suggestionsFrom } from "./resumeRules"

const good = `Sara Natour
sara@example.com · +962 79 123 4567 · linkedin.com/in/sara · github.com/sara

Summary
Frontend engineer after a senior React role.

Experience
Frontend Engineer, Hooli — Mar 2024 to Oct 2026
- Cut page load by 40% across the web app.
- Led a team of three on the design system.

Education
BSc Computer Science, 2020

Skills
React, TypeScript, Convex`

describe("resume rules", () => {
  it("reads the contact details and the standard sections", () => {
    expect(contactOf(good)).toEqual({
      name: "Sara Natour",
      email: "sara@example.com",
      phone: "+962 79 123 4567",
      links: ["linkedin.com/in/sara", "github.com/sara"],
    })
    expect(sectionsOf(good)).toEqual(["Summary", "Experience", "Education", "Skills"])
  })

  it("fails the checks a parser would trip on, and says what to change", () => {
    const columns = `Sara Natour\nsara@example.com\nExperience\n${"Role    Company    2024\n".repeat(12)}Education\nSkills\n${"word ".repeat(200)}`
    const names = (text: string) =>
      checksOf(text)
        .filter((c) => !c.ok)
        .map((c) => c.name)
    expect(names(columns)).toEqual(["Phone number at the top", "Single column, no tables"])
    expect(names(good)).toEqual(["One or two pages"])
    expect(checksOf(good).find((c) => !c.ok)?.fix).toMatch(/very short/)
  })

  it("turns Jev's no's and the missing tags into advice", () => {
    expect(
      suggestionsFrom({ summaryStatesRole: true, resultsInBullets: false }, [
        { tag: "React", shown: "yes" },
        { tag: "Rust", shown: "no" },
        { tag: "Go", shown: "unsure" },
      ])
    ).toEqual([
      "Give each experience bullet a number or an outcome: what changed because of you.",
      "Your Preferences list “Rust”, but the resume doesn't show it. Add where you used it, or leave it off your Preferences.",
    ])
  })

  it("reads a review from before Jev could say unsure", () => {
    const stored = {
      at: 1,
      contact: { links: [] },
      sections: [],
      checks: [],
      suggestions: [],
      words: 1,
    }
    const shows = [
      { tag: "React", shown: true },
      { tag: "Rust", shown: false },
      { tag: "Go", shown: "unsure" as const },
    ]
    expect(readReview({ ...stored, shows }).shows.map((s) => s.shown)).toEqual([
      "yes",
      "no",
      "unsure",
    ])
  })
})
