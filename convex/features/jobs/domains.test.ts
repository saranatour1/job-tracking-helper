import { describe, expect, it } from "vite-plus/test"

import { domainSaysName, endingOf, groupDomains, proofOf } from "./domains"

describe("a role's proof", () => {
  it("needs a site, and says how the board reached it", () => {
    expect(proofOf("stripe.com", "postings")).toBe("own")
    expect(proofOf("stripe.com", "name")).toBe("name")
    expect(proofOf("stripe.com", null)).toBe("name")
    expect(proofOf(null, "postings")).toBe("unverified")
    expect(proofOf(undefined, undefined)).toBe("unverified")
  })
})

describe("a domain's ending", () => {
  it("is its last label", () => {
    expect(endingOf("stripe.com")).toBe(".com")
    expect(endingOf("hooli.co.uk")).toBe(".uk")
  })
})

describe("a domain and its company's name", () => {
  it("match only when the first label is the whole name", () => {
    expect(domainSaysName("databricks.com", "Databricks")).toBe(true)
    expect(domainSaysName("open-ai.com", "OpenAI")).toBe(false)
    expect(domainSaysName("toasttab.com", "Toast")).toBe(false)
  })
})

describe("grouping roles by domain", () => {
  const job = (company: string, domain: string | null, boardId: string | null = null) => ({
    company,
    evidence: { domain, boardId },
  })

  it("keeps the order they came in, and joins boards reaching one site", () => {
    const groups = groupDomains([
      job("Stripe", "stripe.com"),
      job("Hooli", "hooli.xyz"),
      job("Stripe Payments", "stripe.com"),
    ])
    expect(groups.map((g) => g.map((j) => j.company))).toEqual([
      ["Stripe", "Stripe Payments"],
      ["Hooli"],
    ])
  })

  it("files a role with no site under its company's name", () => {
    const groups = groupDomains([job("Wren", null), job("Marlow", null), job("Wren", null)])
    expect(groups.map((g) => g.length)).toEqual([2, 1])
  })

  it("keeps one name on two boards apart, since each has its own count", () => {
    const groups = groupDomains([job("Wren", null, "a"), job("Wren", null, "b")])
    expect(groups.map((g) => g.length)).toEqual([1, 1])
  })
})
