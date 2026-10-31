import { describe, expect, it } from "vite-plus/test"

import {
  domainOf,
  nameMatches,
  postingDomain,
  rdapRegistries,
  registeredAtOf,
  searchedDomain,
  ycByDomain,
} from "./companies"

describe("a link's domain", () => {
  it("drops subdomains, and keeps suffixes like co.uk whole", () => {
    expect(domainOf("https://careers.airbnb.com/positions/1")).toBe("airbnb.com")
    expect(domainOf("https://www.coinbase.com/careers")).toBe("coinbase.com")
    expect(domainOf("https://jobs.elastic.co/1")).toBe("elastic.co")
    expect(domainOf("https://jobs.acme.co.uk/1")).toBe("acme.co.uk")
    expect(domainOf("not a link")).toBeNull()
  })
})

describe("a company's own site, from its postings", () => {
  it("is where most postings live", () => {
    expect(postingDomain(["https://stripe.com/jobs/1", "https://stripe.com/jobs/2"])).toBe(
      "stripe.com"
    )
    expect(
      postingDomain([
        "https://careers.toasttab.com/1",
        "https://careers.toasttab.com/2",
        "https://job-boards.greenhouse.io/toast/jobs/3",
      ])
    ).toBe("toasttab.com")
  })

  it("isn't a job board's host", () => {
    for (const url of [
      "https://job-boards.greenhouse.io/x/jobs/1",
      "https://job-boards.eu.greenhouse.io/x/jobs/1",
      "https://jobs.lever.co/x/1",
      "https://jobs.ashbyhq.com/x/1",
      "https://x.jobs.personio.de/job/1",
      "https://apply.workable.com/x/j/ABC",
      "https://jobs.smartrecruiters.com/X/1",
    ])
      expect(postingDomain([url])).toBeNull()
    expect(postingDomain([])).toBeNull()
  })
})

describe("a domain matching a company's name", () => {
  it("takes the whole name, with its usual trimmings", () => {
    expect(nameMatches("Stripe", "stripe.com")).toBe(true)
    expect(nameMatches("Retell Ai", "retellai.com")).toBe(true)
    expect(nameMatches("Exnaton Ag", "exnaton.com")).toBe(true)
    expect(nameMatches("SurfSense Inc.", "surfsense.io")).toBe(true)
    expect(nameMatches("Bolt.new", "bolt.new")).toBe(true)
    expect(nameMatches("Leland", "joinleland.com")).toBe(true)
    expect(nameMatches("Cursor", "getcursor.com")).toBe(true)
  })

  it("doesn't take a word of the name, or a name too short to mean anything", () => {
    expect(nameMatches("Open Energy Transition", "open.com")).toBe(false)
    expect(nameMatches("Teaching Lab", "teaching.com")).toBe(false)
    expect(nameMatches("Block", "blockchain.com")).toBe(false)
    expect(nameMatches("X", "x.com")).toBe(false)
    expect(nameMatches("日本", "nihon.jp")).toBe(false)
  })

  it("picks the first search result that fits, past lists and social sites", () => {
    const urls = [
      "https://www.linkedin.com/company/hooli",
      "https://en.wikipedia.org/wiki/Hooli",
      "https://jobs.lever.co/hooli",
      "https://www.hooli.xyz/about",
      "https://hooli.com",
    ]
    expect(searchedDomain("Hooli", urls)).toBe("hooli.xyz")
    expect(searchedDomain("Pied Piper", urls)).toBeNull()
  })

  it("won't call a job board the company's site", () => {
    expect(searchedDomain("Lever", ["https://jobs.lever.co/lever"])).toBeNull()
  })
})

describe("the YC list", () => {
  it("finds companies by website domain, with what's public about them", () => {
    const yc = ycByDomain([
      {
        name: "Stripe",
        website: "https://www.stripe.com/",
        batch: "Summer 2009",
        status: "Active",
        team_size: 7000,
        url: "https://www.ycombinator.com/companies/stripe",
      },
    ])
    expect(yc.get("stripe.com")).toEqual({
      batch: "Summer 2009",
      status: "Active",
      teamSize: 7000,
      url: "https://www.ycombinator.com/companies/stripe",
    })
  })

  it("leaves out rows with no site, no real batch, or marked not YC", () => {
    const yc = ycByDomain([
      { website: "", batch: "Summer 2009", status: "Active" },
      { website: "https://a.com", batch: "Unspecified", status: "Active" },
      { website: "https://b.com", batch: "other", status: "Active" },
      { website: "https://monzo.com", batch: "Winter 2016", status: "Not YC" },
    ])
    expect(yc.size).toBe(0)
  })

  it("survives a reply in an unexpected shape", () => {
    expect(ycByDomain({ nope: true }).size).toBe(0)
    expect(ycByDomain(null).size).toBe(0)
  })
})

describe("the RDAP registries", () => {
  it("gives each suffix's address, ready to add a path to", () => {
    const registries = rdapRegistries({
      services: [
        [["com", "net"], ["https://rdap.verisign.com/com/v1/"]],
        [["app"], ["https://pubapi.registry.google/rdap"]],
        [["old"], ["http://insecure.example/"]],
      ],
    })
    expect(registries.get("net")).toBe("https://rdap.verisign.com/com/v1/")
    expect(registries.get("app")).toBe("https://pubapi.registry.google/rdap/")
    expect(registries.has("old")).toBe(false)
    expect(rdapRegistries(null).size).toBe(0)
  })
})

describe("a domain's RDAP record", () => {
  it("gives the registration date", () => {
    expect(
      registeredAtOf({
        events: [
          { eventAction: "expiration", eventDate: "2027-09-11T04:00:00Z" },
          { eventAction: "registration", eventDate: "1995-09-12T04:00:00Z" },
        ],
      })
    ).toBe(Date.UTC(1995, 8, 12, 4))
  })

  it("has nothing to say without one", () => {
    expect(registeredAtOf({ events: [{ eventAction: "expiration" }] })).toBeNull()
    expect(registeredAtOf({ events: [{ eventAction: "registration" }] })).toBeNull()
    expect(registeredAtOf(null)).toBeNull()
  })
})
