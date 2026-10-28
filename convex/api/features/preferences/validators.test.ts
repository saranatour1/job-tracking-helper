import { type } from "arktype"
import { describe, expect, it } from "vite-plus/test"

import { arkOutputToConvex, arkToConvex } from "../../../lib/ark"
import { emptyPreferences, Preferences, PreferencesDraft } from "./validators"

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
