import { afterAll, beforeAll, describe, expect, it, vi } from "vite-plus/test"

import { botAuthHeaders, botKeyDirectory } from "./webBotAuth"

const encoder = new TextEncoder()
const decode = (text: string) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0))

const verifies = async (key: CryptoKey, signature: string, lines: string[]) =>
  crypto.subtle.verify(
    "Ed25519",
    key,
    decode(signature.slice("sig1=:".length, -1)),
    encoder.encode(lines.join("\n"))
  )

describe("web bot auth", () => {
  let publicKey: CryptoKey

  beforeAll(async () => {
    const pair = (await crypto.subtle.generateKey({ name: "Ed25519" }, true, [
      "sign",
      "verify",
    ])) as CryptoKeyPair
    publicKey = pair.publicKey
    vi.stubEnv("SITE_URL", "https://ye.saranatour.dev")
    vi.stubEnv(
      "WEB_BOT_AUTH_KEY",
      JSON.stringify(await crypto.subtle.exportKey("jwk", pair.privateKey))
    )
  })
  afterAll(() => vi.unstubAllEnvs())

  it("signs a request so the public key verifies it", async () => {
    const headers = await botAuthHeaders("https://boards-api.greenhouse.io/v1/boards/acme/jobs")
    expect(headers["Signature-Agent"]).toBe('"https://ye.saranatour.dev"')
    expect(headers["Signature-Input"]).toContain('tag="web-bot-auth"')
    const lines = [
      '"@authority": boards-api.greenhouse.io',
      `"signature-agent": "https://ye.saranatour.dev"`,
      `"@signature-params": ${headers["Signature-Input"].slice("sig1=".length)}`,
    ]
    expect(await verifies(publicKey, headers.Signature, lines)).toBe(true)
    expect(await verifies(publicKey, headers.Signature, ['"@authority": other.example'])).toBe(
      false
    )
  })

  it("publishes only the public half, and signs the directory", async () => {
    const response = await botKeyDirectory()
    const { keys } = (await response.json()) as { keys: Record<string, string>[] }
    expect(keys).toHaveLength(1)
    expect(keys[0].d).toBeUndefined()
    expect(keys[0].x).toBeTruthy()
    expect(response.headers.get("Content-Type")).toBe(
      "application/http-message-signatures-directory+json"
    )
    const input = response.headers.get("Signature-Input") ?? ""
    expect(input).toContain('tag="http-message-signatures-directory"')
    const lines = [
      '"@authority";req: ye.saranatour.dev',
      `"@signature-params": ${input.slice("sig1=".length)}`,
    ]
    expect(await verifies(publicKey, response.headers.get("Signature") ?? "", lines)).toBe(true)
  })

  it("sends nothing extra without a key, or with a broken one", async () => {
    vi.stubEnv("WEB_BOT_AUTH_KEY", "not json")
    expect(await botAuthHeaders("https://example.com")).toEqual({})
    vi.stubEnv("WEB_BOT_AUTH_KEY", "")
    expect(await botAuthHeaders("https://example.com")).toEqual({})
    expect(await (await botKeyDirectory()).json()).toEqual({ keys: [] })
  })
})
