import { expect, test } from "vite-plus/test"

import { redirectSearch } from "./redirect"

test("only sends someone back to a path on this site", () => {
  expect(redirectSearch({ redirect: "/jobs/engineer-acme-kd7?x=1" }).redirect).toBe(
    "/jobs/engineer-acme-kd7?x=1"
  )
  for (const bad of ["https://evil.test", "//evil.test", "/\\evil.test", "jobs", "/a b", 3])
    expect(redirectSearch({ redirect: bad }).redirect).toBeUndefined()
})
