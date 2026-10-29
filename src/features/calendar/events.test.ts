import { describe, expect, it } from "vite-plus/test"

import type { Application } from "@/features/tracker/data"
import type { MailEvent } from "@/features/tracker/mail"

import {
  dayKey,
  eventsOf,
  followUpAfter,
  type SavedEvent,
  timeOf,
  toKloq,
  toSaved,
  withSaved,
} from "./events"

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

describe("toKloq", () => {
  const base = { id: "e", title: "t", detail: "d", kind: "interview" as const }

  it("keeps an interview slot's wall-clock time, an hour long and read-only", () => {
    const e = toKloq({ ...base, at: Date.UTC(2026, 10, 3, 10, 30), wallClock: true })
    expect(e).toMatchObject({ color: "emerald", readOnly: true })
    expect(e.start.slice(0, 16)).toBe("2026-11-03T10:30")
    expect(e.end.slice(0, 16)).toBe("2026-11-03T11:30")
  })

  it("makes a slot with no time, and every follow-up, an all-day event ending the next day", () => {
    expect(toKloq({ ...base, at: Date.UTC(2026, 10, 3), wallClock: true })).toMatchObject({
      allDay: true,
      start: "2026-11-03",
      end: "2026-11-04",
    })
    const at = new Date(2026, 9, 31, 15).getTime()
    expect(toKloq({ ...base, kind: "followup", at })).toMatchObject({
      allDay: true,
      start: "2026-10-31",
      end: "2026-11-01",
    })
  })
})

describe("withSaved and toSaved", () => {
  const slot = {
    id: "m1:slot",
    at: Date.UTC(2026, 10, 3, 10, 30),
    kind: "interview" as const,
    title: "Interview",
    detail: "Acme",
    applicationId: "a1",
    wallClock: true,
  }
  const row = (patch: Partial<SavedEvent>): SavedEvent =>
    ({
      _id: "r1",
      _creationTime: 0,
      userId: "u",
      key: "k1",
      title: "Prep",
      start: "2026-11-04T14:00:00+02:00",
      end: "2026-11-04T15:00:00+02:00",
      allDay: false,
      kind: "reminder",
      ...patch,
    }) as SavedEvent

  it("makes interview slots movable, and a saved fix takes the slot's place", () => {
    expect(withSaved([slot], [], () => undefined)[0]).toMatchObject({
      id: "m1:slot",
      editable: true,
    })
    const fixed = withSaved(
      [slot],
      [
        row({
          key: "m1:slot",
          replaces: "m1:slot",
          kind: "interview",
          applicationId: "a1" as never,
        }),
      ],
      () => "Acme"
    )
    expect(fixed).toHaveLength(1)
    expect(fixed[0]).toMatchObject({
      id: "m1:slot",
      detail: "Acme",
      saved: { replaces: "m1:slot" },
    })
  })

  it("drops a slot you removed, and keeps your own events", () => {
    const hiddenFix = row({ key: "m1:slot", replaces: "m1:slot", hidden: true })
    expect(withSaved([slot], [hiddenFix, row({})], () => undefined).map((e) => e.id)).toEqual([
      "k1",
    ])
  })

  it("saves a moved slot as a fix of itself, and only links real applications", () => {
    const moved = toKloq({ ...slot, editable: true })
    expect(toSaved({ ...moved, calendarId: "a1" }, slot, new Set(["a1"]))).toMatchObject({
      key: "m1:slot",
      replaces: "m1:slot",
      kind: "interview",
      applicationId: "a1",
    })
    expect(toSaved({ ...moved, calendarId: "none" }, undefined, new Set(["a1"]))).toMatchObject({
      replaces: undefined,
      kind: undefined,
      applicationId: undefined,
    })
  })
})
