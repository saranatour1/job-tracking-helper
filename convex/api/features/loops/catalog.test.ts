import { describe, expect, it } from "vite-plus/test"

import {
  blankTemplate,
  creditsPerRun,
  dailySizes,
  loopQuestions,
  loopTemplates,
  runTimes,
  templateById,
} from "./catalog"

describe("loop catalog", () => {
  it("has every template answer every question, with a size and time people can pick", () => {
    for (const template of [...loopTemplates, blankTemplate]) {
      expect(Object.keys(template.answers).sort()).toEqual(Object.keys(loopQuestions).sort())
      expect(dailySizes).toContain(template.daily)
      expect(runTimes).toContain(template.at)
    }
  })

  it("keeps template ids unique and finds the blank one", () => {
    const ids = loopTemplates.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(templateById("custom")).toBe(blankTemplate)
    expect(templateById("nope")).toBeUndefined()
  })

  it("estimates a 10-job morning at 33 credits", () => {
    expect(creditsPerRun(10)).toBe(33)
  })
})

describe("loop answers", () => {
  it("validates exactly the catalog's questions", async () => {
    const { LoopAnswers } = await import("./validators")
    expect(Object.keys(LoopAnswers.json as { required: unknown[] }).length).toBeGreaterThan(0)
    const all = Object.fromEntries(Object.keys(loopQuestions).map((q) => [q, true]))
    expect(LoopAnswers.allows(all)).toBe(true)
    expect(LoopAnswers.allows({ ...all, usePreferences: "yes" })).toBe(false)
    const { usePreferences: _, ...missingOne } = all
    expect(LoopAnswers.allows(missingOne)).toBe(false)
  })
})
