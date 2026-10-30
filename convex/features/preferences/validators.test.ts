import { type } from "arktype"
import { describe, expect, it } from "vite-plus/test"

import { arkOutputToConvex, arkToConvex } from "../../lib/ark"
import {
  emptyPreferences,
  Preferences,
  PreferencesDraft,
  PrefilledFields,
  PrefilledSections,
} from "./validators"

describe("Preferences", () => {
  it("converts to Convex validators for args and storage", () => {
    expect(() => arkToConvex(Preferences)).not.toThrow()
    expect(() => arkOutputToConvex(Preferences)).not.toThrow()
  })

  it("accepts the empty form and trims tags", () => {
    expect(Preferences({ ...emptyPreferences, interests: ["  climate "] })).toMatchObject({
      interests: ["climate"],
    })
  })

  it("rejects an over-long tag", () => {
    expect(Preferences({ ...emptyPreferences, avoid: ["x".repeat(61)] })).toBeInstanceOf(
      type.errors
    )
  })
})

describe("PreferencesDraft, an assistant's reply", () => {
  it("keeps the fields it knows, even nested ones, and drops the rest", () => {
    expect(
      PreferencesDraft({
        interests: ["developer tools"],
        workMode: "remote",
        answers: { pay: "60k EUR", mood: "great" },
        favouriteColour: "green",
      })
    ).toEqual({ interests: ["developer tools"], workMode: "remote", answers: { pay: "60k EUR" } })
  })

  it("keeps your own question and answer pairs", () => {
    expect(
      PreferencesDraft({ custom: [{ question: " Portfolio? ", answer: "sara.dev", extra: 1 }] })
    ).toEqual({ custom: [{ question: "Portfolio?", answer: "sara.dev" }] })
  })

  it("reports a field with the wrong shape", () => {
    expect(PreferencesDraft({ workMode: "sometimes" })).toBeInstanceOf(type.errors)
  })
})

describe("PrefilledSections", () => {
  const section = (title: string, ...labels: string[]) => ({
    title,
    fields: labels.map((label) => ({ label, value: "" })),
  })

  it("converts to Convex validators, leaving the repeat checks to arktype", () => {
    expect(arkToConvex(PrefilledSections).kind).toBe("array")
    expect(() => arkOutputToConvex(PrefilledSections)).not.toThrow()
  })

  it("trims titles, labels and values", () => {
    expect(
      PrefilledSections([
        { title: " Contact ", fields: [{ label: " LinkedIn ", value: " in/s " }] },
      ])
    ).toEqual([{ title: "Contact", fields: [{ label: "LinkedIn", value: "in/s" }] }])
  })

  it("allows the same label in different sections", () => {
    expect(PrefilledSections.allows([section("You", "Name"), section("Reference", "Name")])).toBe(
      true
    )
  })

  it("rejects a label used twice in one section, ignoring case and spaces", () => {
    const result = PrefilledSections([section("Contact", "Email", " email")])
    expect((result as type.errors).summary).toContain('"email" is listed twice')
  })

  it("rejects two sections with the same title", () => {
    const result = PrefilledSections([section("Contact"), section("contact ")])
    expect((result as type.errors).summary).toContain('There are two "contact" sections')
  })

  it("rejects an empty title or label", () => {
    expect(PrefilledSections([section(" ")])).toBeInstanceOf(type.errors)
    expect(PrefilledFields([{ label: " ", value: "x" }])).toBeInstanceOf(type.errors)
  })
})
