import { describe, expect, it } from "vite-plus/test"

import { detailUrls, feedUrl, parseFeed, plainText, searchSlug } from "./boards"
import { boardOf, canPrepare, formUrlOf, isClosedSite, previewOf } from "./links"

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
    expect(boardOf("https://cloover.jobs.personio.de/job/2317211?language=en")).toEqual({
      kind: "personio",
      slug: "cloover",
    })
    expect(boardOf("https://jobs.smartrecruiters.com/BoschGroup/1-sales")).toEqual({
      kind: "smartrecruiters",
      slug: "boschgroup",
    })
    expect(boardOf("https://apply.workable.com/sword-group/j/ABC/")).toEqual({
      kind: "workable",
      slug: "sword-group",
    })
    expect(boardOf("https://apply.workable.com/j/ABC")).toBeNull()
    expect(boardOf("https://jobs.smartrecruiters.com/ni/acme/1")).toBeNull()
    expect(boardOf("https://careers.stripe.com/x")).toBeNull()
    expect(boardOf("not a url")).toBeNull()
  })
})

describe("isClosedSite", () => {
  it("knows the sites the app must not read, and no lookalikes", () => {
    for (const url of [
      "https://www.linkedin.com/jobs/view/1",
      "https://de.linkedin.com/jobs/view/1",
      "https://www.xing.com/jobs/berlin-1",
      "https://www.experteer.de/jobs/1",
      "https://x.com/acme/status/1",
      "https://twitter.com/acme/status/1",
    ])
      expect(isClosedSite(url)).toBe(true)
    for (const url of [
      "https://notlinkedin.com/x",
      "https://linkedin.com.evil.example/x",
      "https://netflix.com/x",
      "https://jobs.lever.co/x/1",
      "not a url",
    ])
      expect(isClosedSite(url)).toBe(false)
  })
})

describe("canPrepare", () => {
  it("only offers forms the app can read", () => {
    expect(canPrepare("https://jobs.lever.co/spotify/abc")).toBe(true)
    expect(canPrepare("https://jobs.smartrecruiters.com/BoschGroup/1-sales")).toBe(false)
    expect(canPrepare("https://apply.workable.com/acme/j/ABC/")).toBe(false)
    expect(canPrepare("https://www.arbeitsagentur.de/jobsuche/jobdetail/1-S")).toBe(false)
    expect(canPrepare("https://www.coinbase.com/careers/positions/1?gh_jid=1")).toBe(true)
    expect(canPrepare("https://www.coinbase.com/careers/positions/1")).toBe(false)
  })
})

describe("formUrlOf", () => {
  const greenhouse = { kind: "greenhouse" as const, slug: "coinbase" }
  const ownSite = "https://www.coinbase.com/careers/positions/8333273?gh_jid=8333273"

  it("keeps a link already on a board", () => {
    const url = "https://job-boards.greenhouse.io/hook/jobs/1"
    expect(formUrlOf(url, null)).toBe(url)
  })

  it("sends a Greenhouse role on the company's site to Greenhouse's embedded form", () => {
    expect(formUrlOf(ownSite, greenhouse)).toBe(
      "https://job-boards.greenhouse.io/embed/job_app?for=coinbase&token=8333273"
    )
  })

  it("finds no form on a board whose forms the app can't read", () => {
    expect(formUrlOf("https://jobs.smartrecruiters.com/BoschGroup/1-sales", null)).toBeNull()
    expect(formUrlOf("https://apply.workable.com/acme/j/ABC/", null)).toBeNull()
  })

  it("finds no form without the board, its id, or a Greenhouse board", () => {
    expect(formUrlOf(ownSite, null)).toBeNull()
    expect(formUrlOf(ownSite, { kind: "lever", slug: "coinbase" })).toBeNull()
    expect(formUrlOf("https://www.coinbase.com/careers/1", greenhouse)).toBeNull()
    expect(formUrlOf("https://www.coinbase.com/careers?gh_jid=1%26for=x", greenhouse)).toBeNull()
    expect(formUrlOf("not a url", greenhouse)).toBeNull()
  })
})

describe("parseFeed", () => {
  it("reads SmartRecruiters with each role's text, and drops a role whose text failed", () => {
    const feed = {
      content: [
        {
          id: "1",
          name: "Sales",
          company: { name: "Bosch Group" },
          releasedDate: "2026-10-31T00:14:50.750Z",
          location: { fullLocation: "Munich, Germany", remote: false },
        },
        { id: "2", name: "Lost", company: { name: "Bosch Group" } },
      ],
    }
    expect(detailUrls("smartrecruiters", "Bosch Group", feed)[0]).toEqual({
      id: "1",
      url: "https://api.smartrecruiters.com/v1/companies/Bosch%20Group/postings/1",
    })
    const details = new Map<string, unknown>([
      [
        "1",
        {
          postingUrl: "https://jobs.smartrecruiters.com/BoschGroup/1-sales",
          jobAd: { sections: { jobDescription: { text: "<p>Sell <b>tools</b>.</p>" } } },
        },
      ],
    ])
    const jobs = parseFeed("smartrecruiters", "BoschGroup", feed, now, details)
    expect(jobs[0]).toEqual({
      url: "https://jobs.smartrecruiters.com/BoschGroup/1-sales",
      title: "Sales",
      company: "Bosch Group",
      location: "Munich, Germany",
      remote: false,
      postedAt: Date.parse("2026-10-31T00:14:50.750Z"),
      text: "Sales\nBosch Group · Munich, Germany\n\nSell **tools**.",
    })
    expect(jobs[1]?.url).toBe("")
  })

  it("reads Workable, with the link a pasted posting would have", () => {
    const [job] = parseFeed(
      "workable",
      "sword-group",
      {
        name: "Sword Group",
        jobs: [
          {
            title: "Developer",
            shortcode: "A5",
            telecommuting: true,
            published_on: "2026-10-28",
            city: "Aberdeen",
            state: "Scotland",
            country: "United Kingdom",
            description: "<p>Build.</p>",
          },
        ],
      },
      now
    )
    expect(job).toMatchObject({
      url: "https://apply.workable.com/sword-group/j/A5/",
      company: "Sword Group",
      location: "Aberdeen, Scotland, United Kingdom",
      remote: true,
    })
  })

  it("names Remote OK as the source, as its terms ask, and skips its legal notice", () => {
    const jobs = parseFeed(
      "remoteok",
      "remote-ok",
      [
        { legal: "API Terms of Service" },
        {
          url: "https://remoteOK.com/remote-jobs/1",
          position: "Recruiter",
          company: "CAI",
          location: "Australia",
          epoch: 1793376015,
          description: "<p>Hire.</p>",
        },
      ],
      now
    ).filter((j) => j.title)
    expect(jobs).toEqual([
      {
        url: "https://remoteOK.com/remote-jobs/1",
        title: "Recruiter",
        company: "CAI · via Remote OK",
        location: "Australia",
        remote: true,
        postedAt: 1793376015000,
        text: "Recruiter\nCAI · via Remote OK · Australia\n\nHire.",
      },
    ])
  })

  it("reads the latest Who is hiring thread, one role per top-level comment", () => {
    const feed = { hits: [{ objectID: "49922569" }] }
    expect(detailUrls("hackernews", "hacker-news", feed)).toEqual([
      { id: "49922569", url: "https://hn.algolia.com/api/v1/items/49922569" },
    ])
    const thread = {
      children: [
        {
          id: 7,
          created_at_i: 1790866971,
          text: "Shepherd &#x2F; Inc | Engineer | Remote<p>We&#x27;re hiring.",
        },
        { id: 8, created_at_i: 1790866971, text: null },
      ],
    }
    const jobs = parseFeed("hackernews", "hacker-news", feed, now, new Map([["49922569", thread]]))
    expect(jobs).toHaveLength(1)
    expect(jobs[0]).toMatchObject({
      url: "https://news.ycombinator.com/item?id=7",
      title: "Shepherd / Inc | Engineer | Remote",
      company: "Shepherd / Inc",
      remote: true,
      postedAt: 1790866971000,
    })
  })

  it("reads an Arbeitsagentur search, and refuses a place it corrected to another", () => {
    const slug = searchSlug("Pflegefachkraft", "Berlin")
    expect(feedUrl("arbeitsagentur", slug)).toContain("was=pflegefachkraft&wo=berlin&size=50")
    const feed = (bereinigterOrt: string) => ({
      woOutput: { bereinigterOrt },
      ergebnisliste: [
        {
          referenznummer: "10001-1-S",
          stellenangebotsTitel: "Pflegefachkraft (m/w/d)",
          firma: "Permacon GmbH",
          datumErsteVeroeffentlichung: "2026-10-30",
          gehaltsspanneVon: 25,
          gehaltsspanneBis: 27,
          verguetungsangabe: "STUNDENLOHN",
          stellenlokationen: [{ adresse: { ort: "Berlin" } }, { adresse: { ort: "Berlin" } }],
        },
      ],
    })
    const details = new Map<string, unknown>([
      ["10001-1-S", { stellenangebotsBeschreibung: "Pflege im **Krankenhaus**." }],
    ])
    expect(parseFeed("arbeitsagentur", slug, feed("Berlin"), now, details)).toEqual([
      {
        url: "https://www.arbeitsagentur.de/jobsuche/jobdetail/10001-1-S",
        title: "Pflegefachkraft (m/w/d)",
        company: "Permacon GmbH",
        location: "Berlin",
        remote: false,
        postedAt: Date.parse("2026-10-30"),
        text: "Pflegefachkraft (m/w/d)\nPermacon GmbH · Berlin\n\nPflege im **Krankenhaus**.\n\nPay: 25-27 (STUNDENLOHN)",
      },
    ])
    expect(detailUrls("arbeitsagentur", slug, feed("Berlin"))).toHaveLength(1)
    const paris = searchSlug("Pflegefachkraft", "Paris")
    expect(parseFeed("arbeitsagentur", paris, feed("Parin"), now)).toEqual([])
    expect(detailUrls("arbeitsagentur", paris, feed("Parin"))).toEqual([])
  })

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

  it("reads Personio's XML, with every office and the description sections", () => {
    const xml = `<?xml version="1.0"?><workzag-jobs><position>
      <id>42</id><office>Munich</office><additionalOffices><office>Berlin</office></additionalOffices>
      <name>Frontend Engineer &amp; Designer</name>
      <jobDescriptions><jobDescription><name>About</name><value><![CDATA[<p>Build <b>tools</b>.</p>]]></value></jobDescription></jobDescriptions>
      <createdAt>2026-10-01T10:00:00+00:00</createdAt></position></workzag-jobs>`
    expect(parseFeed("personio", "acme-labs", xml, now)).toEqual([
      {
        url: "https://acme-labs.jobs.personio.de/job/42",
        title: "Frontend Engineer & Designer",
        company: "Acme Labs",
        location: "Munich, Berlin",
        remote: false,
        postedAt: Date.parse("2026-10-01T10:00:00+00:00"),
        text: "Frontend Engineer & Designer\nAcme Labs · Munich, Berlin\n\nBuild **tools**.",
      },
    ])
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
