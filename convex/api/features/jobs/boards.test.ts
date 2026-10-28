import { describe, expect, it } from "vite-plus/test"

import { boardOf, parseFeed, plainText, previewOf } from "./boards"

const now = Date.parse("2026-10-28T08:00:00Z")

describe("boardOf", () => {
  it("finds the board behind a posting URL", () => {
    expect(boardOf("https://job-boards.greenhouse.io/Vercel/jobs/1")).toEqual({
      kind: "greenhouse",
      slug: "vercel",
    })
    expect(boardOf("https://jobs.lever.co/spotify/abc")).toEqual({ kind: "lever", slug: "spotify" })
    expect(boardOf("https://jobs.ashbyhq.com/linear/abc")).toEqual({
      kind: "ashby",
      slug: "linear",
    })
    expect(boardOf("https://careers.stripe.com/x")).toBeNull()
    expect(boardOf("not a url")).toBeNull()
  })
})

describe("parseFeed", () => {
  it("reads Greenhouse's escaped HTML and spots remote roles from the location", () => {
    const [job] = parseFeed(
      "greenhouse",
      "vercel",
      {
        jobs: [
          {
            absolute_url: "https://job-boards.greenhouse.io/vercel/jobs/1",
            title: "Engineer",
            company_name: "Vercel",
            location: { name: "Remote - US" },
            first_published: "2026-10-27T12:00:00-04:00",
            content: "&lt;p&gt;Build &amp;amp; ship.&lt;/p&gt;",
          },
        ],
      },
      now
    )
    expect(job).toEqual({
      url: "https://job-boards.greenhouse.io/vercel/jobs/1",
      title: "Engineer",
      company: "Vercel",
      location: "Remote - US",
      remote: true,
      postedAt: Date.parse("2026-10-27T12:00:00-04:00"),
      text: "Engineer\nVercel · Remote - US\n\nBuild & ship.",
    })
  })

  it("reads Lever and Ashby, and skips unlisted Ashby roles", () => {
    const [lever] = parseFeed(
      "lever",
      "spotify",
      [
        {
          hostedUrl: "https://jobs.lever.co/spotify/a",
          text: "Designer",
          categories: { location: "Stockholm" },
          workplaceType: "remote",
          createdAt: 1792767640768,
          descriptionPlain: "Design.",
        },
      ],
      now
    )
    expect(lever).toMatchObject({ company: "Spotify", remote: true, postedAt: 1792767640768 })
    const ashby = parseFeed(
      "ashby",
      "linear",
      {
        jobs: [
          { jobUrl: "https://jobs.ashbyhq.com/linear/a", title: "PM", isListed: false },
          { jobUrl: "https://jobs.ashbyhq.com/linear/b", title: "Eng", location: "Europe" },
        ],
      },
      now
    )
    expect(ashby.map((j) => j.title)).toEqual(["Eng"])
    expect(ashby[0]).toMatchObject({ remote: false, postedAt: now })
  })

  it("survives a feed in an unexpected shape", () => {
    expect(parseFeed("greenhouse", "x", null, now)).toEqual([])
    expect(parseFeed("lever", "x", { error: "nope" }, now)).toEqual([])
  })
})

describe("plainText and previewOf", () => {
  it("turns HTML into lines and previews the description without the title", () => {
    expect(plainText("<h2>About</h2><p>We build<br>tools</p>")).toBe("About\nWe build\ntools")
    expect(previewOf("Engineer\nAcme · Remote\n\nWe build tools.")).toBe("We build tools.")
  })
})
