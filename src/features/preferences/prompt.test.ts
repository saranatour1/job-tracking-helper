import { describe, expect, it } from "vite-plus/test"

import { parseReply } from "./prompt"

describe("parseReply", () => {
  it("finds the JSON inside a code fence and a sentence", () => {
    const reply = 'Here you go:\n```json\n{ "interests": ["climate"], "workMode": "remote" }\n```'
    expect(parseReply(reply)).toEqual({ draft: { interests: ["climate"], workMode: "remote" } })
  })

  it("explains a reply with no JSON or broken JSON", () => {
    expect(parseReply("Sure! What do you enjoy?").error).toMatch(/no JSON/)
    expect(parseReply('{ "interests": [climate] }').error).toMatch(/isn't valid JSON/)
  })

  it("passes on arktype's message for a wrong shape", () => {
    expect(parseReply('{ "workMode": "sometimes" }').error).toMatch(/workMode/)
  })
})
