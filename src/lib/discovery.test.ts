import { beforeAll, describe, expect, it, vi } from "vite-plus/test"

vi.stubEnv("VITE_CONVEX_URL", "https://tiger.convex.cloud")

const { discovery } = await import("./discovery")

const read = async (path: string) => {
  const response = await discovery[path]?.()
  if (!response) throw new Error(`Nothing serves ${path}`)
  return response
}
const jsonOf = async <T>(path: string) => (await (await read(path)).json()) as T

describe("discovery documents", () => {
  beforeAll(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => Promise.resolve(Response.json({ issuer: "convex", fetched: url })))
    )
  })

  it("serves the API catalog as a linkset pointing at the MCP server", async () => {
    const response = await read("/.well-known/api-catalog")
    expect(response.headers.get("Content-Type")).toBe("application/linkset+json")
    const { linkset } = (await response.json()) as {
      linkset: Record<string, unknown>[]
    }
    expect(linkset[0].anchor).toBe("https://tiger.convex.site/mcp")
    expect(linkset[0]["service-desc"]).toBeTruthy()
    expect(linkset[0]["service-doc"]).toBeTruthy()
  })

  it("lists skills whose digests and names match their files", async () => {
    const { skills } = await jsonOf<{ skills: { name: string; url: string; digest: string }[] }>(
      "/.well-known/agent-skills/index.json"
    )
    expect(skills.map((s) => s.name)).toEqual([
      "job-search",
      "job-search-no-account",
      "job-goals-no-account",
    ])
    for (const skill of skills) {
      const body = await (await read(new URL(skill.url).pathname)).text()
      const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body))
      const hex = Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join("")
      expect(skill.digest).toBe(`sha256:${hex}`)
      expect(body).toContain(`name: ${skill.name}\n`)
    }
  })

  it("starts auth.md with the heading scanners look for, and lists every scope", async () => {
    const body = await (await read("/auth.md")).text()
    expect(body.split("\n")[0]).toMatch(/^# .*auth\.md/)
    expect(body).toContain("`notifications:write`")
    expect(body).toContain("https://tiger.convex.site/mcp")
  })

  it("reads OAuth metadata from Convex, adding the empty key set", async () => {
    const metadata = await jsonOf<Record<string, string>>("/.well-known/oauth-authorization-server")
    expect(metadata.fetched).toBe(
      "https://tiger.convex.site/.well-known/oauth-authorization-server"
    )
    expect(metadata.jwks_uri).toBe("https://ye.saranatour.dev/.well-known/jwks.json")
    expect(await jsonOf(new URL(metadata.jwks_uri).pathname)).toEqual({ keys: [] })
  })

  it("passes on a Convex failure instead of calling it valid metadata", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ code: "paused" }, { status: 500 }))
    const response = await read("/.well-known/oauth-authorization-server")
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ code: "paused" })
  })

  it("describes the MCP server the app actually runs", async () => {
    const card = await jsonOf<{ transport: { endpoint: string }; capabilities: object }>(
      "/.well-known/mcp/server-card.json"
    )
    expect(card.transport.endpoint).toBe("https://tiger.convex.site/mcp")
    expect(card.capabilities).toEqual({ tools: { listChanged: false } })
  })
})
