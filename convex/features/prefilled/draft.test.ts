import { describe, expect, it } from "vite-plus/test"

import { canDraft, draftPrompt, draftsFrom, withDrafts } from "./draft"
import { statusFrom } from "./match"
import type { PrefillField } from "./validators"

const field = (question: string, more: Partial<PrefillField> = {}): PrefillField => ({
  question,
  type: "textarea",
  required: true,
  source: "none",
  ...more,
})

describe("what gets a draft", () => {
  it("takes a required, blank, free-text question", () => {
    expect(canDraft(field("Why do you want to work here?"))).toBe(true)
  })

  it("leaves personal facts to the person", () => {
    for (const q of [
      "Phone",
      "Are you authorized to work in Germany?",
      "Are you legally eligible to work in Bulgaria on an ongoing basis?",
      "Will you require visa sponsorship?",
      "What are your salary expectations?",
      "Earliest start date",
    ])
      expect(canDraft(field(q)), q).toBe(false)
  })

  it("skips optional, answered and pick-list questions", () => {
    expect(canDraft(field("Anything else?", { required: false }))).toBe(false)
    expect(canDraft(field("Why us?", { answer: "Mine", source: "you" }))).toBe(false)
    expect(canDraft(field("Why us?", { options: ["A", "B"] }))).toBe(false)
    expect(canDraft(field("Why us?", { type: "custom" }))).toBe(false)
  })
})

describe("what the model is told", () => {
  const prompt = draftPrompt({
    resumeText: "Test Person, test.person@example.com, +49 30 5550100. Acme, 2021 - 2024.",
    answers: [
      { label: "About you", value: "I like clear docs." },
      { label: "Phone", value: "+49 30 5550100" },
      { label: "Salary", value: "90000" },
      { label: "Physical mailing address", value: "Teststrasse 1" },
    ],
    company: "Hooli",
    title: "Engineer",
    postingText: "Build things.",
    questions: ["Why us?"],
  })

  it("leaves out contact details and personal facts", () => {
    expect(prompt).not.toContain("example.com")
    expect(prompt).not.toContain("5550100")
    expect(prompt).not.toContain("90000")
    expect(prompt).not.toContain("Teststrasse")
  })

  it("keeps what it needs, date ranges included", () => {
    expect(prompt).toContain("2021 - 2024")
    expect(prompt).toContain("I like clear docs.")
    expect(prompt).toContain("1. Why us?")
  })
})

describe("reading the reply", () => {
  it("reads plain and fenced JSON", () => {
    expect(draftsFrom('{"answers":[" One ",""]}', 2)).toEqual(["One", ""])
    expect(draftsFrom('```json\n{"answers":["One"]}\n```', 1)).toEqual(["One"])
  })

  it("gives nothing for a malformed or misaligned reply", () => {
    expect(draftsFrom("Sure! Here you go", 1)).toEqual([])
    expect(draftsFrom('{"answers":["Only one"]}', 2)).toEqual([])
    expect(draftsFrom('{"answers":[1]}', 1)).toEqual([])
  })

  it("cuts an answer to what a form row allows", () => {
    expect(draftsFrom(JSON.stringify({ answers: ["x".repeat(3000)] }), 1)[0]).toHaveLength(2000)
  })
})

describe("drafts on an application", () => {
  it("marks a draft as AI's, and leaves a blank reply blank", () => {
    const [a, b] = withDrafts(
      [field("Why us?"), field("Who referred you?")],
      ["Why us?", "Who referred you?"],
      ["Because.", ""]
    )
    expect(a).toMatchObject({ answer: "Because.", source: "ai" })
    expect(b).toMatchObject({ source: "none" })
    expect(b?.answer).toBeUndefined()
  })

  it("never writes over a fact, even if the model answered it", () => {
    const [phone] = withDrafts([field("Phone")], ["Phone"], ["555"])
    expect(phone?.answer).toBeUndefined()
  })

  it("needs you until you've saved it", () => {
    expect(statusFrom([field("Why us?", { answer: "Because.", source: "ai" })])).toBe(
      "needsAnswers"
    )
    expect(statusFrom([field("Why us?", { answer: "Because.", source: "you" })])).toBe("ready")
  })
})
