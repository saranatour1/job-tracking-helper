import { describe, expect, it } from "vite-plus/test"

import { addressWithoutPlus, baseAddress, messagesIn, numberIn, taggedAddress } from "./addresses"

describe("an application's address", () => {
  it("tags the local part and reads it back", () => {
    const address = taggedAddress("reach@saranatour.dev", 12)
    expect(address).toBe("reach+app-12@saranatour.dev")
    expect(numberIn([address])).toBe(12)
  })

  it("finds nothing in a plain address or someone else's plus address", () => {
    expect(numberIn(["reach@saranatour.dev"])).toBeUndefined()
    expect(numberIn(["reach+news@saranatour.dev"])).toBeUndefined()
    expect(numberIn([""])).toBeUndefined()
  })

  it("replaces a tag the address already has, since a second wouldn't match a rule", () => {
    expect(taggedAddress("sarant+sorry@example.com", 3)).toBe("sarant+app-3@example.com")
    expect(baseAddress("sarant+sorry@example.com")).toBe("sarant@example.com")
    expect(baseAddress("reach@example.com")).toBe("reach@example.com")
  })

  it("has a form without a plus, and reads it back", () => {
    const address = addressWithoutPlus("reach@example.com", 7)
    expect(address).toBe("reach.app-7@example.com")
    expect(numberIn([address])).toBe(7)
  })
})

describe("mail files", () => {
  it("splits an mbox, and leaves a single message whole", () => {
    const mbox =
      "From a@b Mon Jan 1\nSubject: One\n\nHi\nFrom a@b Tue Jan 2\r\nSubject: Two\n\nYo\n"
    expect(messagesIn(mbox)).toEqual(["Subject: One\n\nHi", "Subject: Two\n\nYo"])
    expect(messagesIn("Subject: One\n\nHi")).toEqual(["Subject: One\n\nHi"])
  })
})
