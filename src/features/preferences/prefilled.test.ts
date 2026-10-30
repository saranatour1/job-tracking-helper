import { emptyPreferences, PrefilledSections } from "@convex/features/preferences/validators"
import { describe, expect, it } from "vite-plus/test"

import { fillEmpty, suggestedSections } from "./prefilled"

const me = { name: "Sara", email: "sara@example.com" }
const valueOf = (sections: ReturnType<typeof suggestedSections>, label: string) =>
  sections.flatMap((s) => s.fields).find((f) => f.label === label)?.value

describe("suggestedSections", () => {
  it("fills what it knows and leaves the rest empty", () => {
    const sections = suggestedSections(
      { ...emptyPreferences, locations: ["Berlin", "Remote EU"] },
      me
    )
    expect(sections.map((s) => s.title)).toEqual(["Contact", "Work", "About you"])
    expect(valueOf(sections, "Full name")).toBe("Sara")
    expect(valueOf(sections, "Preferred locations")).toBe("Berlin, Remote EU")
    expect(valueOf(sections, "Work arrangement")).toBe("")
  })

  it("puts your own questions in their own section, without blanks or repeats", () => {
    const sections = suggestedSections(
      {
        ...emptyPreferences,
        custom: [
          { question: "Portfolio?", answer: "sara.dev" },
          { question: " portfolio? ", answer: "again" },
          { question: " ", answer: "x" },
        ],
      },
      me
    )
    expect(sections.at(-1)).toEqual({
      title: "Your questions",
      fields: [{ label: "Portfolio?", value: "sara.dev" }],
    })
  })

  it("always passes the saved shape's checks", () => {
    expect(PrefilledSections.allows(suggestedSections(emptyPreferences, me))).toBe(true)
  })
})

describe("fillEmpty", () => {
  it("fills empty values and adds what's missing without overwriting", () => {
    const { sections, filled } = fillEmpty(
      [
        {
          title: "contact",
          fields: [
            { label: "Email", value: "mine@example.com" },
            { label: "full name", value: "" },
          ],
        },
        { title: "References", fields: [{ label: "Name", value: "" }] },
      ],
      [
        {
          title: "Contact",
          fields: [
            { label: "Full name", value: "Sara" },
            { label: "Email", value: "sara@example.com" },
          ],
        },
        { title: "Work", fields: [{ label: "Salary expectation", value: "60k EUR" }] },
      ]
    )
    expect(sections).toEqual([
      {
        title: "contact",
        fields: [
          { label: "Email", value: "mine@example.com" },
          { label: "full name", value: "Sara" },
        ],
      },
      { title: "References", fields: [{ label: "Name", value: "" }] },
      { title: "Work", fields: [{ label: "Salary expectation", value: "60k EUR" }] },
    ])
    expect(filled).toBe(2)
  })
})
