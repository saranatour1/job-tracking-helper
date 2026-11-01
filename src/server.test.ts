import { beforeEach, describe, expect, it, vi } from "vite-plus/test"

import { site } from "@/lib/seo"

const mocks = vi.hoisted(() => ({
  trackAgents: vi.fn(() => Promise.resolve()),
  app: vi.fn(() => Promise.resolve(new Response("app"))),
}))

vi.mock("@databuddy/sdk/agents", () => ({ trackAgents: mocks.trackAgents }))
vi.mock("@tanstack/react-start/server-entry", () => ({ default: { fetch: mocks.app } }))

const { default: server } = await import("./server")

const asset = vi.fn(() => Promise.resolve(new Response("asset")))
const env = { ASSETS: { fetch: asset } }
const ctx = { waitUntil: vi.fn() }
const get = (path: string) => new Request(`https://ye.saranatour.dev${path}`)

describe("server entry", () => {
  beforeEach(() => vi.clearAllMocks())

  it("reports a page and renders it", async () => {
    const request = get("/privacy")
    const response = await server.fetch(request, env, ctx)
    expect(mocks.trackAgents).toHaveBeenCalledWith(request, { websiteId: site.databuddyId })
    expect(ctx.waitUntil).toHaveBeenCalledOnce()
    expect(await response.text()).toBe("app")
  })

  it("reports llms.txt and serves the file", async () => {
    const response = await server.fetch(get("/llms.txt"), env, ctx)
    expect(mocks.trackAgents).toHaveBeenCalledOnce()
    expect(await response.text()).toBe("asset")
  })

  it("does nothing extra in local dev, where only the request is passed", async () => {
    const response = await server.fetch(get("/llms.txt"))
    expect(mocks.trackAgents).not.toHaveBeenCalled()
    expect(await response.text()).toBe("app")
  })
})
