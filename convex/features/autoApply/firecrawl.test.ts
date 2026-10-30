import { describe, expect, it } from "vite-plus/test"

import { fillScript, readFormScript, submitScript } from "./firecrawl"

// The scripts are text until Firecrawl runs them, so a bad escape would only show up there.
const AsyncFunction = (async () => {}).constructor as new (...args: string[]) => unknown
const compiles = (code: string) => () => new AsyncFunction("page", code)

describe("form scripts", () => {
  it("are valid JavaScript", () => {
    expect(compiles(readFormScript())).not.toThrow()
    expect(compiles(submitScript("#submit"))).not.toThrow()
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
})
