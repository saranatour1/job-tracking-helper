import { describe, expect, it } from "vite-plus/test"

import type { Application } from "@/features/tracker/data"
import type { MailEvent } from "@/features/tracker/mail"

import { dayKey, eventsOf, followUpAfter, timeOf } from "./events"

const app = (patch: Partial<Application>): Application => ({
  id: "a1",
  role: "Frontend Engineer",
  company: "Acme",
  status: "applied",
  priority: "none",
  labels: [],
  method: "Company site",
  location: "",
  createdAt: "2026-10-01T09:00:00.000Z",
  description: "",
  history: [{ status: "applied", at: "2026-10-01T09:00:00.000Z" }],
  ...patch,
})

const mail = (patch: Partial<MailEvent>): MailEvent =>
  ({
    id: "m1",
    applicationId: "a1",
    kind: "interview",
    from: "Acme Recruiting",
    subject: "Next steps",
    at: Date.parse("2026-10-05T12:00:00.000Z"),
    ...patch,
  }) as MailEvent

describe("eventsOf", () => {
  it("dates applying, mail, interview slots and a follow-up after the last news", () => {
    const events = eventsOf([app({})], [mail({ slot: Date.UTC(2026, 10, 3, 10, 30) })])
    expect(events.map((e) => e.kind)).toEqual(["applied", "email", "followup", "interview"])
    const followUp = events.find((e) => e.kind === "followup")!
    expect(followUp.at).toBe(Date.parse("2026-10-05T12:00:00.000Z") + followUpAfter)
    const slot = events.find((e) => e.kind === "interview")!
    expect([dayKey(slot), timeOf(slot)]).toEqual(["2026-11-03", "10:30"])
  })

  it("follows up only while the application waits at Applied", () => {
    const events = eventsOf(
      [
        app({
          status: "interviewing",
          history: [
            { status: "applied", at: "2026-10-01T09:00:00.000Z" },
            { status: "interviewing", at: "2026-10-04T09:00:00.000Z" },
          ],
        }),
      ],
      []
    )
    expect(events.map((e) => e.title)).toEqual([
      "Applied: Frontend Engineer",
      "Interviewing: Frontend Engineer",
    ])
  })
})
