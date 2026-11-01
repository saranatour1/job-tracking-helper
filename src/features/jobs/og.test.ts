import { describe, expect, it } from "vite-plus/test"

import { detailsOf } from "./og"

const none = { domain: null, link: null, yc: null, registeredAt: null }
const job = { location: "Berlin", remote: false, text: "", evidence: none }
const yc = { batch: "Summer 2009", status: "Active", url: "" }

describe("detailsOf", () => {
  it("only says what's known", () => {
    expect(detailsOf(job)).toEqual(["Berlin"])
    expect(detailsOf({ ...job, location: "" })).toEqual(["Location not listed"])
    expect(detailsOf({ ...job, location: "", remote: true })).toEqual(["Remote"])
  })

  it("shortens a long list of places", () => {
    expect(detailsOf({ ...job, location: "Remote, Canada; Remote, UK; Remote, US" })[0]).toBe(
      "Remote, Canada +2 more"
    )
  })

  it("keeps remote-first to postings that say it", () => {
    expect(detailsOf({ ...job, remote: true })).toEqual(["Berlin", "Remote"])
    expect(detailsOf({ ...job, location: "Remote, Canada", remote: true })).toEqual([
      "Remote, Canada",
    ])
    expect(detailsOf({ ...job, remote: true, text: "We're a Remote-First team" })).toEqual([
      "Berlin",
      "Remote-first",
    ])
  })

  it("finds culture in the posting's words, not in a stray technical term", () => {
    expect(detailsOf({ ...job, text: "Flexible hours and a 4-day week." })).toEqual([
      "Berlin",
      "Flexible hours",
      "4-day week",
    ])
    expect(detailsOf({ ...job, text: "Build async APIs and flexible schemas." })).toEqual([
      "Berlin",
    ])
  })

  it("trusts YC only when the postings live on the company's site", () => {
    const found = { ...none, domain: "x.com", yc }
    expect(detailsOf({ ...job, evidence: { ...found, link: "postings" } })).toContain(
      "YC Summer 2009"
    )
    expect(detailsOf({ ...job, evidence: { ...found, link: "name" } })).toEqual(["Berlin"])
  })

  it("stays short enough to fit", () => {
    const text =
      "remote-first async-first flexible hours four-day week unlimited pto mission-driven employee-owned"
    expect(detailsOf({ ...job, text })).toEqual(["Berlin", "Remote-first", "Async-first"])
  })
})
