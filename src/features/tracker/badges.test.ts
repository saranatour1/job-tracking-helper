import { describe, expect, it } from "vite-plus/test"

import { activityOf } from "./badges"
import type { Application } from "./data"

const day = 24 * 60 * 60 * 1000
const now = Date.parse("2026-10-29T12:00:00Z")
const app = (status: Application["status"], daysAgo: number, noteDaysAgo?: number) =>
  ({
    status,
    createdAt: new Date(now - 60 * day).toISOString(),
    history: [{ status, at: new Date(now - daysAgo * day).toISOString() }],
    notes:
      noteDaysAgo === undefined
        ? []
        : [{ text: "x", at: new Date(now - noteDaysAgo * day).toISOString() }],
  }) as unknown as Application

describe("activityOf", () => {
  it("calls an open application with recent news active", () => {
    expect(activityOf(app("applied", 3), now)).toEqual({ quiet: false, label: "Active" })
  })
  it("counts the weeks an open application has been quiet", () => {
    expect(activityOf(app("interviewing", 22), now)).toEqual({ quiet: true, label: "Quiet 3w" })
  })
  it("treats a recent note as news", () => {
    expect(activityOf(app("applied", 30, 2), now)?.quiet).toBe(false)
  })
  it("says nothing for saved or closed applications", () => {
    expect(activityOf(app("saved", 40), now)).toBeUndefined()
    expect(activityOf(app("rejected", 40), now)).toBeUndefined()
  })
})
