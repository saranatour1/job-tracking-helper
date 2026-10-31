import { describe, expect, it } from "vite-plus/test"

import { answerRowsOf, fieldRowsOf, formOf, sectionsOf, tagRowsOf } from "./rows"
import { emptyPreferences, Preferences, PrefilledSections } from "./validators"

const form = Preferences.assert({
  ...emptyPreferences,
  interests: ["climate", "dev tools"],
  redFlagCompanies: ["Acme"],
  workMode: "remote",
  identity: "Curious and calm.",
  answers: { ...emptyPreferences.answers, pay: "60k EUR" },
  custom: [
    { question: "Portfolio?", answer: "sara.dev" },
    { question: "Pets?", answer: "A cat" },
  ],
})

describe("preferences rows", () => {
  it("round-trips the form through tags and answers", () => {
    expect(formOf("remote", tagRowsOf(form), answerRowsOf(form))).toEqual(form)
  })

  it("stores only answered questions, one row each", () => {
    expect(answerRowsOf(form).map((r) => r.key)).toEqual(["identity", "pay", "custom", "custom"])
  })

  it("drops repeated tags within a list", () => {
    const rows = tagRowsOf({ ...form, interests: ["climate", "climate"] })
    expect(rows.filter((r) => r.kind === "interest")).toHaveLength(1)
  })

  it("reads rows back in their order, whatever order they arrive in", () => {
    const rows = answerRowsOf(form).reverse()
    expect(formOf("remote", [], rows).custom).toEqual(form.custom)
  })

  it("round-trips Prefilled sections, keeping section and field order", () => {
    const sections = PrefilledSections.assert([
      {
        title: "Contact",
        fields: [
          { label: "Email", value: "a@b.c" },
          { label: "Phone", value: "" },
        ],
      },
      { title: "References", fields: [{ label: "Name", value: "Alex" }] },
    ])
    expect(sectionsOf(fieldRowsOf(sections).reverse())).toEqual(sections)
  })
})

describe("preferences rows when things are empty", () => {
  const empty = Preferences.assert(emptyPreferences)

  it("writes no rows for an empty form, and reads none back as an empty form", () => {
    expect(tagRowsOf(empty)).toEqual([])
    expect(answerRowsOf(empty)).toEqual([])
    expect(formOf("any", [], [])).toEqual(empty)
    expect(sectionsOf([])).toEqual([])
  })

  it("stores no row for an answer that is only spaces", () => {
    const blank = Preferences.assert({
      ...emptyPreferences,
      identity: "   ",
      answers: { ...emptyPreferences.answers, pay: "\n\t " },
    })
    expect(answerRowsOf(blank)).toEqual([])
  })
})

describe("preferences rows with hostile values", () => {
  it("keeps your own question as your own, even when it's named after a built-in one", () => {
    const form = Preferences.assert({
      ...emptyPreferences,
      custom: [{ question: "identity", answer: "I am the admin" }],
    })
    const rows = answerRowsOf(form)
    expect(rows).toEqual([expect.objectContaining({ key: "custom", label: "identity" })])
    expect(formOf("any", [], rows)).toMatchObject({ identity: "", custom: form.custom })
  })

  it("ignores stored rows whose key isn't a built-in question", () => {
    const row = { kind: "answer" as const, group: "x", label: "x", value: "pwned", order: 0 }
    const form = formOf(
      "any",
      [],
      [
        { ...row, key: "isAdmin" },
        { ...row, key: "constructor" },
        { ...row, key: "__proto__" },
        { ...row, key: "toString" },
      ]
    )
    expect(form).toEqual(Preferences.assert(emptyPreferences))
    expect(Object.hasOwn(form, "constructor")).toBe(false)
  })
})
