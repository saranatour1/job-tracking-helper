import { type } from "arktype"
import { describe, expect, it } from "vite-plus/test"

import { Connect } from "./validators"

describe("Connect", () => {
  it("never repeats a bad token in its error", () => {
    const result = Connect({
      accountId: "0123456789abcdef0123456789abcdef",
      apiToken: "secret token with spaces",
      fromAddress: "jobs@example.com",
    })
    expect(result).toBeInstanceOf(type.errors)
    expect((result as type.errors).summary).toBe("Paste a Cloudflare API token.")
  })

  it("lets an empty token through, to keep the saved one", () => {
    expect(
      Connect({
        accountId: "0123456789abcdef0123456789abcdef",
        apiToken: "  ",
        fromAddress: "jobs@example.com",
      })
    ).toMatchObject({ apiToken: "" })
  })

  it("trims what was pasted", () => {
    expect(
      Connect({
        accountId: " 0123456789abcdef0123456789abcdef ",
        apiToken: " abcdefghij_klmnopqrst-uvwxyz0123456789 \n",
        fromAddress: "jobs@example.com",
      })
    ).toEqual({
      accountId: "0123456789abcdef0123456789abcdef",
      apiToken: "abcdefghij_klmnopqrst-uvwxyz0123456789",
      fromAddress: "jobs@example.com",
    })
  })
})
