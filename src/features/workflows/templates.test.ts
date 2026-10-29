import { blocksOf, problemOf } from "@convex/api/features/automations/validators"
import { describe, expect, it } from "vite-plus/test"

import { draftOf, templateNames } from "./templates"

describe("templates", () => {
  it.each(templateNames)("%s saves as it comes, given a loop", (name) => {
    const draft = draftOf(name, "Asia/Hebron", "loop1")
    expect(problemOf(draft.name, draft.trigger, draft.steps)).toBeUndefined()
  })

  it("checks an email matched an application before acting on it", () => {
    for (const name of templateNames) {
      const draft = draftOf(name, "UTC", "loop1")
      if (draft.trigger.kind !== "mail") continue
      const first = draft.steps[0]
      expect(first).toMatchObject({ kind: "onlyIf", fact: "application.company", test: "set" })
    }
  })

  it("asks for a loop when Morning job search has none", () => {
    const draft = draftOf("jobSearch", "UTC")
    expect(problemOf(draft.name, draft.trigger, draft.steps)).toBe(
      "Pick a loop to find roles with."
    )
  })

  it("keeps every template small", () => {
    for (const name of templateNames)
      expect(blocksOf(draftOf(name, "UTC", "loop1").steps).length).toBeLessThanOrEqual(5)
  })
})
