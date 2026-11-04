import { expect, test } from "vite-plus/test"

import { sitemapXml } from "./sitemap"

test("lists each role's page with the day it was posted, escaped", () => {
  const xml = sitemapXml([
    {
      _id: "kd7abc",
      title: "R&D Engineer",
      company: "Acme <Labs>",
      postedAt: Date.UTC(2026, 10, 4),
    },
  ])
  expect(xml).toContain("<loc>https://ye.saranatour.dev/jobs/")
  expect(xml).toContain("-kd7abc</loc><lastmod>2026-11-04</lastmod>")
  expect(xml).not.toMatch(/<loc>[^<]*[&<>"][^<]*<\/loc>/)
})
