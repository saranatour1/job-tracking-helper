import { describe, expect, it } from "vite-plus/test"

import { sitemapXml } from "./sitemap"

describe("sitemapXml", () => {
  it("lists the public pages and each posting at its canonical address", () => {
    const xml = sitemapXml([
      { _id: "k57abc", title: "Senior Engineer & Lead", company: "Figma", postedAt: 0 },
    ])
    expect(xml).toContain("<loc>https://ye.saranatour.dev/jobs</loc>")
    expect(xml).toContain(
      "<loc>https://ye.saranatour.dev/jobs/senior-engineer-lead-figma-k57abc</loc><lastmod>1970-01-01T00:00:00.000Z</lastmod>"
    )
  })
})
