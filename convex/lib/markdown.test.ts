import { describe, expect, it } from "vite-plus/test"

import { parseFeed, previewOf } from "../api/features/jobs/boards"
import { markdownOf, unmark } from "./markdown"

describe("markdownOf", () => {
  it("keeps a posting's shape: headings, lists, links and entities", () => {
    expect(
      markdownOf(
        "<h2>About</h2><p>We&rsquo;re <strong>remote</strong> &amp; small.</p><ul><li>One</li><li><a href='https://acme.dev'>Two</a></li></ul>"
      )
    ).toBe("## About\n\nWe’re **remote** & small.\n\n- One\n- [Two](https://acme.dev)")
  })

  it("drops scripts, handlers, javascript: links and images", () => {
    const md = markdownOf(
      `<p onclick="steal()">Hi</p><script>steal()</script><style>p{}</style><a href="javascript:steal()">x</a><img src="https://track.er/p.gif"><iframe src="https://evil.dev"></iframe>`
    )
    expect(md).not.toMatch(/steal|script|style|javascript|track\.er|evil|iframe/)
    expect(md).toContain("Hi")
  })
})

describe("unmark", () => {
  it("leaves only the words", () => {
    expect(unmark("## About\n\n- **One** and [two](https://a.dev)\n1. `three`")).toBe(
      "About\n\nOne and two\nthree"
    )
  })
})

describe("posting text", () => {
  it("turns Greenhouse's escaped HTML into Markdown, and previews it as words", () => {
    const [job] = parseFeed(
      "greenhouse",
      "acme",
      {
        jobs: [
          {
            title: "Engineer",
            company_name: "Acme",
            location: { name: "Remote" },
            absolute_url: "https://boards.greenhouse.io/acme/jobs/1",
            content: "&lt;h3&gt;Description&lt;/h3&gt;&lt;p&gt;We&amp;rsquo;re hiring&lt;/p&gt;",
          },
        ],
      },
      0
    )
    expect(job?.text).toBe("Engineer\nAcme · Remote\n\n### Description\n\nWe’re hiring")
    expect(previewOf(job!.text)).toBe("Description We’re hiring")
  })

  it("builds Lever's sections from its HTML", () => {
    const [job] = parseFeed(
      "lever",
      "acme",
      [
        {
          text: "Engineer",
          hostedUrl: "https://jobs.lever.co/acme/1",
          categories: { location: "Berlin" },
          description: "<p>Intro</p>",
          lists: [{ text: "You'll <need>", content: "<li>TypeScript</li>" }],
          additional: "<p>Bye</p>",
          descriptionPlain: "Intro",
        },
      ],
      0
    )
    expect(job?.text).toBe(
      "Engineer\nAcme · Berlin\n\nIntro\n\n### You'll \\<need>\n\n- TypeScript\n\nBye"
    )
  })
})
