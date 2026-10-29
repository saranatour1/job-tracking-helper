import { describe, expect, it } from "vite-plus/test"

import { isStale, open, parseKeys, seal } from "./secrets"

const keyOf = (fill: number) => btoa(String.fromCharCode(...new Uint8Array(32).fill(fill)))

describe("secrets", () => {
  it("opens what it sealed, and seals the same text differently each time", async () => {
    const keys = await parseKeys(`v1:${keyOf(1)}`)
    const a = await seal(keys, "cf-token-1234", "email-token:user1")
    const b = await seal(keys, "cf-token-1234", "email-token:user1")
    expect(a).not.toBe(b)
    expect(a).not.toContain("cf-token")
    expect(await open(keys, a, "email-token:user1")).toBe("cf-token-1234")
  })

  it("won't open for another owner or after tampering", async () => {
    const keys = await parseKeys(`v1:${keyOf(1)}`)
    const sealed = await seal(keys, "cf-token-1234", "email-token:user1")
    await expect(open(keys, sealed, "email-token:user2")).rejects.toThrow()
    const [version, iv, data] = sealed.split(".")
    const flipped = `${data!.startsWith("A") ? "B" : "A"}${data!.slice(1)}`
    await expect(open(keys, `${version}.${iv}.${flipped}`, "email-token:user1")).rejects.toThrow()
  })

  it("seals with the last key and still opens with older ones", async () => {
    const old = await parseKeys(`v1:${keyOf(1)}`)
    const sealed = await seal(old, "secret", "aad")
    const rotated = await parseKeys(`v1:${keyOf(1)},v2:${keyOf(2)}`)
    expect(isStale(rotated, sealed)).toBe(true)
    expect(await open(rotated, sealed, "aad")).toBe("secret")
    expect(isStale(rotated, await seal(rotated, "secret", "aad"))).toBe(false)
    await expect(open(await parseKeys(`v2:${keyOf(2)}`), sealed, "aad")).rejects.toThrow(
      /No key v1/
    )
  })

  it("rejects missing or short keys", async () => {
    await expect(parseKeys(undefined)).rejects.toThrow(/isn't set/)
    await expect(parseKeys(`v1:${btoa("short")}`)).rejects.toThrow(/32 bytes/)
  })
})
