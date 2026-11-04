import { expect, test } from "vite-plus/test"

import { jobsSearch, maxPages } from "./search"

test("pages counts past the first and stops at the most Show more reaches", () => {
  expect(jobsSearch({ pages: 3 }).pages).toBe(3)
  expect(jobsSearch({ pages: 1 }).pages).toBeUndefined()
  expect(jobsSearch({ pages: 2.5 }).pages).toBeUndefined()
  expect(jobsSearch({ pages: "3" }).pages).toBeUndefined()
  expect(jobsSearch({ pages: 999 }).pages).toBe(maxPages)
})
