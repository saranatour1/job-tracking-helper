// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { convexTest } from "convex-test"
import { describe, expect, it } from "vite-plus/test"

import { api } from "../../_generated/api"
import schema from "../../schema"

const modules = import.meta.glob([
  "../../**/*.ts",
  "!../../components/notifications/**",
  "!../../components/cloudflareEmail/**",
  "!../../**/*.test.ts",
])

const setup = async () => {
  const t = convexTest(schema, modules)
  const userId = await t.run((ctx) => ctx.db.insert("users", { name: "Sam" }))
  return t.withIdentity({ subject: userId })
}

const event = {
  key: "e1",
  title: "Call with Hooli",
  start: "2026-11-03T10:30:00+01:00",
  end: "2026-11-03T11:00:00+01:00",
  allDay: false,
}

describe("calendar events", () => {
  it("names an untitled event, and guesses its kind from the title", async () => {
    const as = await setup()
    await as.mutation(api.api.calendar.save, event)
    await as.mutation(api.api.calendar.save, { ...event, key: "e2", title: "   " })
    const saved = await as.query(api.api.calendar.list, {})
    expect(saved.map((e) => [e.title, e.kind])).toEqual([
      ["Call with Hooli", "interview"],
      ["Untitled", "reminder"],
    ])
  })

  it("refuses times it can't read, or that run backwards", async () => {
    const as = await setup()
    await expect(as.mutation(api.api.calendar.save, { ...event, start: "soon" })).rejects.toThrow(
      "isn't one the calendar can read"
    )
    await expect(
      as.mutation(api.api.calendar.save, { ...event, end: "2026-11-03T09:00:00+01:00" })
    ).rejects.toThrow("can't end before it starts")
    await expect(
      as.mutation(api.api.calendar.save, { ...event, allDay: true, start: "2026-11-03" })
    ).rejects.toThrow("isn't one the calendar can read")
  })

  it("cuts what runs long instead of refusing it", async () => {
    const as = await setup()
    await as.mutation(api.api.calendar.save, {
      ...event,
      title: "t".repeat(201),
      description: "d".repeat(2001),
      exdates: Array.from({ length: 201 }, (_, i) => `d${i}`),
      reminders: Array.from({ length: 11 }, () => ({ minutesBefore: 5 })),
    })
    const [saved] = await as.query(api.api.calendar.list, {})
    expect(saved?.title).toHaveLength(200)
    expect(saved?.description).toHaveLength(2000)
    expect(saved?.reminders).toHaveLength(10)
    expect(saved?.exdates).toHaveLength(200)
    expect(saved?.exdates?.at(-1)).toBe("d200")
  })
})

describe("calendar settings", () => {
  it("round-trips, and replaces what was there", async () => {
    const as = await setup()
    await as.mutation(api.api.calendar.saveSettings, { timeZone: "Asia/Amman", weekStartsOn: 6 })
    await expect(as.query(api.api.calendar.settings, {})).resolves.toEqual({
      timeZone: "Asia/Amman",
      weekStartsOn: 6,
    })
    await as.mutation(api.api.calendar.saveSettings, { hour12: true })
    await expect(as.query(api.api.calendar.settings, {})).resolves.toEqual({ hour12: true })
  })

  it("refuses zones that don't exist and days that run backwards", async () => {
    const as = await setup()
    await expect(
      as.mutation(api.api.calendar.saveSettings, { timeZone: "Mars/Base" })
    ).rejects.toThrow("Mars/Base isn't a time zone.")
    await expect(
      as.mutation(api.api.calendar.saveSettings, { dayStartHour: 20, dayEndHour: 8 })
    ).rejects.toThrow("has to start before it ends")
  })
})
