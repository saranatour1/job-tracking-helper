import { expect, test } from "vite-plus/test"

import { companyRuns } from "./group"
import { isDomain } from "./logo"

const role = (company: string, boardId = company) => [{ company, evidence: { boardId } }]

test("folds a company's roles in a row, and only those", () => {
  const [a1, a2, b, a3] = [role("Axon"), role("Axon"), role("Discord"), role("Axon")]
  expect(companyRuns([a1!, a2!, b!, a3!])).toEqual([[a1, a2], [b], [a3]])
})

test("keeps one name on two boards apart", () => {
  expect(companyRuns([role("Acme", "a"), role("Acme", "b")])).toHaveLength(2)
})

test("asks for a logo only by a plain domain", () => {
  expect(isDomain("axon.com")).toBe(true)
  expect(isDomain("jobs.axon.co.uk")).toBe(true)
  expect(isDomain("localhost")).toBe(false)
  expect(isDomain("axon.com/../x")).toBe(false)
  expect(isDomain("169.254.169.254")).toBe(false)
})
