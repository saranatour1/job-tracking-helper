import { describe, expect, it } from "vite-plus/test"

import { loopTemplates } from "../loops/catalog"
import { criteriaOf, isPostingUrl, localSearchesOf, queriesOf, urlKey } from "./fit"

const tags = [
  { kind: "interest" as const, value: "developer tools" },
  { kind: "interest" as const, value: "climate" },
  { kind: "location" as const, value: "Berlin" },
  { kind: "company" as const, value: "Linear" },
  { kind: "avoid" as const, value: "ad tech" },
  { kind: "redFlagCompany" as const, value: "Acme" },
  { kind: "skill" as const, value: "system design" },
]
const template = (id: string) => loopTemplates.find((t) => t.id === id)!.answers

describe("criteriaOf", () => {
  it("keeps only the answers a run uses, so old loops' extra fields never reach it", () => {
    const old = { ...template("remote-fit"), digest: true }
    expect(Object.keys(criteriaOf(old, tags))).not.toContain("digest")
  })
})

describe("queriesOf", () => {
  it("searches remote roles for each interest", () => {
    expect(queriesOf(criteriaOf(template("remote-fit"), tags))).toEqual([
      "developer tools remote",
      "climate remote",
    ])
  })

  it("searches near each place for on-site roles", () => {
    expect(queriesOf(criteriaOf(template("close-to-home"), tags))[0]).toBe("developer tools Berlin")
  })

  it("watches careers pages for listed companies", () => {
    expect(queriesOf(criteriaOf(template("dream-companies"), tags))).toEqual(["Linear"])
  })

  it("assumes no line of work when Preferences are empty", () => {
    expect(queriesOf(criteriaOf(template("remote-fit"), []))).toEqual(["remote"])
    expect(queriesOf(criteriaOf(template("fresh-today"), []))).toEqual([])
  })
})

describe("localSearchesOf", () => {
  it("searches each topic in each place, only for loops in your places", () => {
    expect(localSearchesOf(criteriaOf(template("close-to-home"), tags))[0]).toEqual({
      what: "developer tools",
      where: "Berlin",
    })
    expect(localSearchesOf(criteriaOf(template("remote-fit"), tags))).toEqual([])
    expect(localSearchesOf(criteriaOf(template("close-to-home"), []))).toEqual([])
  })
})

describe("urlKey", () => {
  it("treats tracking parameters, www and trailing slashes as the same posting", () => {
    expect(urlKey("https://www.Example.com/jobs/12/?utm_source=x&gh_jid=4&ref=feed")).toBe(
      urlKey("https://example.com/jobs/12?gh_jid=4")
    )
  })

  it("treats a board's language, apply page and older host as the same posting", () => {
    expect(urlKey("https://acme.jobs.personio.de/job/12?language=en")).toBe(
      "acme.jobs.personio.de/job/12"
    )
    expect(urlKey("https://jobs.lever.co/acme/abc/apply")).toBe("jobs.lever.co/acme/abc")
    expect(urlKey("https://boards.greenhouse.io/acme/jobs/1")).toBe(
      "job-boards.greenhouse.io/acme/jobs/1"
    )
  })
})

describe("isPostingUrl", () => {
  it("accepts one posting on each job board", () => {
    for (const url of [
      "https://boards.greenhouse.io/acme/jobs/4012345",
      "https://job-boards.greenhouse.io/acme/jobs/4012345?gh_src=x",
      "https://jobs.lever.co/linear/1b2c3d4e-0000-4000-8000-000000000000",
      "https://jobs.ashbyhq.com/notion/2a3b4c5d-0000-4000-8000-000000000000",
      "https://apply.workable.com/acme/j/ABC123DEF/",
      "https://jobs.smartrecruiters.com/BoschGroup/744000158855739-sales",
    ])
      expect(isPostingUrl(url)).toBe(true)
  })

  it("rejects board front pages, other sites and junk", () => {
    for (const url of [
      "https://boards.greenhouse.io/acme",
      "https://jobs.lever.co/linear",
      "https://apply.workable.com/acme/",
      "https://jobs.smartrecruiters.com/BoschGroup",
      "https://www.indeed.com/q-climate-tech-l-remote-jobs.html",
      "https://climatebase.org/",
      "not a url",
    ])
      expect(isPostingUrl(url)).toBe(false)
  })
})
