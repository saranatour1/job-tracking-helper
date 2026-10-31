import { describe, expect, it } from "vite-plus/test"

import { confirmScript, fillScript, readFormScript } from "./firecrawl"

const AsyncFunction = (async () => {}).constructor as new (...args: string[]) => unknown
const compiles = (code: string) => () => new AsyncFunction("page", code)

describe("form scripts", () => {
  it("are valid JavaScript", () => {
    expect(compiles(readFormScript())).not.toThrow()
    expect(compiles(confirmScript())).not.toThrow()
    expect(
      compiles(
        fillScript({
          fills: [{ selector: "#a", value: 'say "hi"', key: "k", type: "text", label: "A" }],
          consent: [],
        })
      )
    ).not.toThrow()
  })

  it("keeps a form's text from breaking out of the plan", () => {
    const script = fillScript({
      fills: [{ selector: "#a", value: '";alert(1);//', key: "k", type: "text", label: "A" }],
      consent: [],
    })
    expect(compiles(script)).not.toThrow()
    expect(script).toContain(JSON.stringify('";alert(1);//'))
  })

  it("sees a thank-you, and nothing on a form still waiting", async () => {
    const run = async (body: string, url: string) => {
      const lines: string[] = []
      const page = {
        url: () => url,
        locator: () => {
          const found = { count: async () => 0, innerText: async () => body }
          return found
        },
      }
      const script = new AsyncFunction("page", "console", confirmScript()) as unknown as (
        page: unknown,
        console: { log: (line: string) => void }
      ) => Promise<void>
      await script(page, { log: (line) => lines.push(line) })
      return JSON.parse(lines[0]!) as { confirmed: boolean; text: string }
    }
    expect(await run("Thank you for applying to Hooli!", "https://x.co/jobs/1")).toEqual({
      confirmed: true,
      text: "Thank you for applying",
    })
    expect((await run("All done", "https://x.co/jobs/1/confirmation")).confirmed).toBe(true)
    expect(await run("Submit Application", "https://x.co/jobs/1")).toEqual({
      confirmed: false,
      text: "",
    })
  })
})
