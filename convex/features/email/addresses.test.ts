import { describe, expect, it } from "vite-plus/test"

import { numberIn, taggedAddress } from "./addresses"

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
})
