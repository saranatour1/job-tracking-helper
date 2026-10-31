import { describe, expect, it } from "vite-plus/test"

import {
  addressWithoutPlus,
  baseAddress,
  companyAddress,
  companyTag,
  messagesIn,
  tagIn,
} from "./addresses"

describe("a company's address", () => {
  it("is the company's name as one word, and reads back", () => {
    const address = companyAddress("jobs@saranatour.dev", "Hooli")
    expect(address).toBe("jobs+hooli@saranatour.dev")
    expect(tagIn([address])).toBe("hooli")
  })

  it("makes one word of any name", () => {
    expect(companyTag("Acme, Inc.")).toBe("acme")
    expect(companyTag("Blue Sky Labs")).toBe("blueskylabs")
    expect(companyTag("Café Zürich GmbH")).toBe("cafezurich")
    expect(companyTag("AT&T")).toBe("att")
  })

  it("falls back to the plain address for a name with no letters to use", () => {
    expect(companyAddress("jobs@example.com", "株式会社")).toBe("jobs@example.com")
    expect(addressWithoutPlus("jobs@example.com", "株式会社")).toBe("jobs@example.com")
  })

  it("replaces a tag the address already has, since a second wouldn't match a rule", () => {
    expect(companyAddress("sarant+sorry@example.com", "Hooli")).toBe("sarant+hooli@example.com")
    expect(baseAddress("sarant+sorry@example.com")).toBe("sarant@example.com")
    expect(baseAddress("jobs@example.com")).toBe("jobs@example.com")
  })

  it("has a form without a plus, and reads it back", () => {
    const address = addressWithoutPlus("jobs@example.com", "Hooli")
    expect(address).toBe("jobs.hooli@example.com")
    expect(tagIn([address])).toBe("hooli")
  })

  it("finds no tag in a plain address", () => {
    expect(tagIn(["jobs@example.com"])).toBeUndefined()
    expect(tagIn([""])).toBeUndefined()
  })

  it("reads the tag past a dot in the name", () => {
    expect(tagIn(["sara.natour+hooli@example.com"])).toBe("hooli")
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
