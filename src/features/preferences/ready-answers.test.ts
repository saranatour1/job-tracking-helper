import { emptyPreferences } from "@convex/api/features/preferences/validators"
import { describe, expect, it } from "vite-plus/test"

import { readyAnswers } from "./ready-answers"

const answerTo = (question: string, values = emptyPreferences) =>
  readyAnswers(values).find((a) => a.question === question)?.answer

describe("readyAnswers", () => {
  it("leaves every answer empty for an empty profile", () => {
    expect(readyAnswers(emptyPreferences).every((a) => a.answer === "")).toBe(true)
  })

  it("joins tags into a readable sentence", () => {
    const values = { ...emptyPreferences, interests: ["climate", "dev tools", "design"] }
    expect(answerTo("What are you looking for in your next role?", values)).toBe(
      "I'm most interested in climate, dev tools and design."
    )
  })

  it("says nothing about work mode when it's open to all", () => {
    const where = "Where are you based, and are you open to remote work or relocating?"
    expect(answerTo(where, { ...emptyPreferences, locations: ["Berlin"] })).toBe(
      "I'd like to work in Berlin."
    )
    expect(answerTo(where, { ...emptyPreferences, workMode: "remote" })).toBe(
      "I prefer remote work."
    )
  })

  it("adds your own questions and skips blank ones", () => {
    const values = {
      ...emptyPreferences,
      custom: [
        { question: "Portfolio?", answer: "sara.dev" },
        { question: " ", answer: "x" },
      ],
    }
    expect(readyAnswers(values).at(-1)).toEqual({
      question: "Portfolio?",
      answer: "sara.dev",
      step: "own",
    })
    expect(readyAnswers(values).length).toBe(9)
  })
})
