import { afterEach, describe, expect, it, vi } from "vite-plus/test"

import { registerSiteTools } from "./web-mcp"

type Registered = {
  name: string
  execute: (input: { page?: string }) => { content: { text: string }[] }
}

const browser = (where: "document" | "navigator", registerTool: (tool: Registered) => unknown) => {
  vi.stubGlobal("document", where === "document" ? { modelContext: { registerTool } } : {})
  vi.stubGlobal("navigator", where === "navigator" ? { modelContext: { registerTool } } : {})
}

describe("registerSiteTools", () => {
  afterEach(() => vi.unstubAllGlobals())

  it("registers on document.modelContext, and opens only known pages", async () => {
    const tools: Registered[] = []
    const navigate = vi.fn()
    browser("document", (tool) => tools.push(tool))
    await registerSiteTools(navigate)
    expect(tools.map((t) => t.name)).toEqual(["get_site_info", "open_page"])

    const open = tools[1]
    open.execute({ page: "privacy" })
    expect(navigate).toHaveBeenCalledWith("/privacy")
    navigate.mockClear()
    expect(open.execute({ page: "constructor" }).content[0].text).toContain("error")
    expect(navigate).not.toHaveBeenCalled()
  })

  it("falls back to navigator.modelContext", async () => {
    const registerTool = vi.fn()
    browser("navigator", registerTool)
    await registerSiteTools(vi.fn())
    expect(registerTool).toHaveBeenCalledTimes(2)
  })

  it("does nothing without the API, and survives one that throws", async () => {
    vi.stubGlobal("document", {})
    vi.stubGlobal("navigator", {})
    await expect(registerSiteTools(vi.fn())).resolves.toBeUndefined()
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    browser("document", () => {
      throw new Error("nope")
    })
    await expect(registerSiteTools(vi.fn())).resolves.toBeUndefined()
    expect(warn).toHaveBeenCalledOnce()
    warn.mockRestore()
  })
})
