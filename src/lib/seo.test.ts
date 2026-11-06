import { readFileSync } from "node:fs"

import { describe, expect, it } from "vite-plus/test"

const robots = readFileSync("public/robots.txt", "utf8")
const rules = (group: string, kind: string) =>
  [...group.matchAll(new RegExp(`^${kind}: (\\S+)$`, "gm"))].map((m) => m[1]!)
const groups = robots.split("\n\n").map((group) => ({
  agents: rules(group, "User-agent"),
  allowed: rules(group, "Allow"),
  disallowed: rules(group, "Disallow"),
}))
const everyone = groups.find((group) => group.agents.includes("*"))!
const trainers = groups.find((group) => group.agents.includes("GPTBot"))!
const disallowed = everyone.disallowed
const routes = Object.keys(import.meta.glob("../routes/**/*.tsx")).map((file) =>
  file.replace("../routes/", "").replace(".tsx", "")
)
const isPublic = (route: string) =>
  [
    "index",
    "privacy",
    "terms",
    "__root",
    "_app/jobs/index",
    "_app/jobs/$id",
    "_app/jobs/trends",
  ].includes(route)

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
    for (const path of [
      "/jobs",
      "/jobs/trends",
      "/privacy",
      "/terms",
      "/llms.txt",
      "/sitemap.xml",
      "/sitemap-jobs.xml",
      "/assets/og.png",
    ]) {
      expect(disallowed.some((rule) => path.startsWith(rule))).toBe(false)
    }
  })

  it("sends AI training crawlers to each role's llms.txt, not its page", () => {
    expect(trainers.agents).toContain("ClaudeBot")
    expect(trainers.disallowed).toEqual(["/jobs/", ...everyone.disallowed])
    expect(trainers.allowed).toEqual(["/jobs/llms.txt", "/jobs/trends$", "/jobs/*/llms.txt"])
  })
})
