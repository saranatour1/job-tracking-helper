import { readFileSync } from "node:fs"

import { describe, expect, it } from "vite-plus/test"

const robots = readFileSync("public/robots.txt", "utf8")
const disallowed = [...robots.matchAll(/^Disallow: (\S+)$/gm)].map((m) => m[1])
const routes = Object.keys(import.meta.glob("../routes/**/*.tsx")).map((file) =>
  file.replace("../routes/", "").replace(".tsx", "")
)
const isPublic = (route: string) => ["index", "privacy", "terms", "__root"].includes(route)

// The first URL segment of a route file, leaving out pathless folders like _app.
const pathOf = (route: string) => {
  const segment = route
    .replaceAll(".", "/")
    .split("/")
    .find((part) => !part.startsWith("_") && part !== "index")
  return segment && `/${segment}`
}

describe("robots.txt", () => {
  it("keeps crawlers out of every route that isn't public", () => {
    const missing = routes
      .filter((route) => !isPublic(route))
      .map(pathOf)
      .filter((path) => path && !disallowed.some((rule) => rule.startsWith(path)))
    expect(missing).toEqual([])
  })

  it("leaves the public pages open", () => {
    expect(disallowed).not.toContain("/")
    for (const path of ["/privacy", "/terms", "/llms.txt", "/sitemap.xml", "/og.png"]) {
      expect(disallowed.some((rule) => path.startsWith(rule))).toBe(false)
    }
  })
})
