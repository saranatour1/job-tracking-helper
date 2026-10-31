import { describe, expect, it } from "vite-plus/test"

import { isContact } from "./rules"

describe("who counts as a contact", () => {
  const own = ["jobs@saranatour.dev", "reach@saranatour.dev"]

  it("keeps a person, and a team inbox someone reads", () => {
    expect(isContact("pat@hooli.com", own)).toBe(true)
    expect(isContact("careers@hooli.com", own)).toBe(true)
  })

  it("leaves out automated senders", () => {
    for (const address of [
      "no-reply@hooli.com",
      "noreply@hooli.com",
      "do-not-reply@hooli.com",
      "notifications@hooli.com",
      "no-reply+abc@hooli.com",
    ])
      expect(isContact(address, own), address).toBe(false)
  })

  it("leaves out hiring tools, whoever the sender says they are", () => {
    expect(isContact("hooli@us.greenhouse-mail.io", own)).toBe(false)
    expect(isContact("pat@hire.lever.co", own)).toBe(false)
  })

  it("leaves out your own domain", () => {
    expect(isContact("jobs+hooli@saranatour.dev", own)).toBe(false)
    expect(isContact("sireen@saranatour.dev", own)).toBe(false)
  })

  it("leaves out something that isn't an address", () => {
    expect(isContact("", own)).toBe(false)
    expect(isContact("pat", own)).toBe(false)
  })
})
