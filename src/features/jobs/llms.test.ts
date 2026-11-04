import { expect, test } from "vite-plus/test"

import { roleMarkdown } from "./llms"

test("a role's Markdown leads with what it is, then its facts, links and posting", () => {
  const md = roleMarkdown({
    _id: "kd7abc",
    title: "Field Engineer",
    company: "Axon",
    location: "Belgium-Remote",
    remote: true,
    postedAt: Date.UTC(2026, 10, 4),
    url: "https://boards.greenhouse.io/axon/jobs/1",
    text: "Field Engineer\n\nYou'll run deployments.",
    summary: "Run deployments for public safety customers.",
    facts: { travel: "Up to 40%", workMode: "Remote" },
    places: ["Remote", "Belgium"],
    evidence: { domain: "axon.com" },
  })
  expect(md.split("\n").slice(0, 10)).toEqual([
    "# Field Engineer at Axon",
    "",
    "> Run deployments for public safety customers.",
    "",
    "- Company: Axon (axon.com)",
    "- Location: Belgium-Remote (remote)",
    "- Places: Remote, Belgium",
    "- Posted: 2026-11-04",
    "- Work mode: Remote",
    "- Travel: Up to 40%",
  ])
  expect(md).toContain("- Apply: https://boards.greenhouse.io/axon/jobs/1")
  expect(md).toMatch(/- Page: https:\/\/ye\.saranatour\.dev\/jobs\/field-engineer-axon-kd7abc/)
  expect(md).toContain("## The posting\n\nField Engineer\n\nYou'll run deployments.")
})
