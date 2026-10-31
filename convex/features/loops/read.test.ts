// @vitest-environment edge-runtime
import { describe, expect, it } from "vite-plus/test"

import { pastedPosting, scrape } from "./read"

const posting = "Pflegefachkraft (m/w/d)\n\nWir suchen Sie, gerne auch im Homeoffice, in Berlin."

describe("pastedPosting", () => {
  it("takes the title from the first line and the company from what was typed", () => {
    expect(pastedPosting("https://www.linkedin.com/jobs/view/1", posting, " Charité ")).toEqual({
      title: "Pflegefachkraft (m/w/d)",
      company: "Charité",
      location: "",
      remote: true,
      text: posting,
    })
  })

  it("names the site when no company was typed, and refuses too little text", () => {
    expect(pastedPosting("https://www.xing.com/jobs/1", posting, "").company).toBe("Xing")
    expect(() => pastedPosting("https://x.com/a/status/1", "We're hiring!", "")).toThrow()
  })
})

describe("scrape", () => {
  it("refuses a closed site before any request", async () => {
    await expect(scrape("https://www.linkedin.com/jobs/view/1")).rejects.toThrow()
  })
})
